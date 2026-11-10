import fs from "fs/promises";
import path from "path";
import * as models from "medior/_generated/server/models";
import { fileURLToPath } from "url";
import { mediaPathKey } from "medior/server/database/media-paths";
import { withMetadataMutation } from "medior/server/database/metadata-mutations";
import { metadataSaveOptions, metadataWriteOptions } from "medior/server/database/metadata-work";
import {
  AudioFileTags,
  compareAlbumTracks,
  compareArtistTracks,
  dayjs,
  getAverageRating,
  isDeepEqual,
  MusicTrack,
  sumArray,
} from "medior/utils/common";
import {
  getIsAudio,
  getIsVideo,
  leanModelToJson,
  makeAction,
  objectIds,
  socket,
} from "medior/utils/server";
import { getAudioInfo } from "medior/utils/server/videos";

type DerivedFields<Schema> = Omit<Schema, "dateCreated" | "dateModified" | "id" | "key">;

type MusicTrackFile = MusicTrack & Pick<models.FileSchema, "duration" | "rating" | "size">;

const TRACK_FIELDS = { duration: 1, music: 1, originalName: 1, rating: 1, size: 1 };

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/** The IDs of the library's files at the paths, in their order, leaving out paths it doesn't have. */
const findFileIdsByPath = async (filePaths: string[]) => {
  const keys = filePaths.map(mediaPathKey);
  const files = await models.FileModel.find({ pathKey: { $in: keys } })
    .select({ _id: 1, path: 1 })
    .lean();
  const fileIds = new Map(files.map((file) => [mediaPathKey(file.path), String(file._id)]));

  return keys.map((key) => fileIds.get(key)).filter(Boolean);
};

/** The derived fields that differ from the saved ones, with the saved IDs compared as strings. */
const getChangedFields = <T extends object>(saved: object, fields: T) =>
  Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => {
      const savedValue = saved[key];
      const comparable = Array.isArray(savedValue)
        ? savedValue.map(String)
        : savedValue && typeof savedValue === "object"
          ? String(savedValue)
          : (savedValue ?? null);

      return !isDeepEqual(comparable, value ?? null);
    }),
  ) as Partial<T> & { dateModified?: string };

/** The spelling most of the values share, such as an artist's name across their tracks. */
const getMostCommon = <T>(values: T[]) => {
  const counts = new Map<T, number>();

  for (const value of values) {
    if (value !== null && value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts].reduce<[T, number]>(
    (best, entry) => (entry[1] > (best?.[1] ?? 0) ? entry : best),
    null,
  )?.[0];
};

/** The totals music items derive from their tracks, in the tracks' order. */
const getTrackTotals = (tracks: MusicTrackFile[]) => ({
  duration: sumArray(tracks, (track) => track.duration ?? 0),
  fileCount: tracks.length,
  fileIds: tracks.map((track) => track.id),
  rating: getAverageRating(tracks.map((track) => track.rating)),
  size: sumArray(tracks, (track) => track.size ?? 0),
});

/** Only audio and video files play, so playlists keep only those. */
const listPlayableFileIds = async (fileIds: string[]) => {
  const files = await models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
    .select({ ext: 1 })
    .lean();

  const playableIds = new Set(
    files
      .filter((file) => getIsAudio(file.ext) || getIsVideo(file.ext))
      .map((file) => String(file._id)),
  );

  return [...new Set(fileIds.map(String))].filter((fileId) => playableIds.has(fileId));
};

const listTracks = async (filter: Record<string, unknown>) =>
  (await models.FileModel.find(filter).select(TRACK_FIELDS).lean()).map((file): MusicTrackFile => ({
    ...file,
    id: String(file._id),
  }));

/**
 * An M3U or M3U8 playlist's tracks in order, as paths, or null for tracks given as web URLs, which
 * aren't files. Lines starting with # are comments or track info, and relative paths start from
 * the playlist's folder. A playlist that isn't valid UTF-8 is read as Latin-1.
 */
const readM3uPlaylist = (playlistPath: string, buffer: Buffer) => {
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = buffer.toString("latin1");
  }

  const folderPath = path.dirname(playlistPath);

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      if (/^file:/i.test(line)) return fileURLToPath(line);
      else if (/^[a-z][a-z\d+.-]+:\/\//i.test(line)) return null;
      else return path.resolve(folderPath, line);
    });
};

/**
 * Rederives an album from its tracks, in disc and track order, creating it for its first track and
 * deleting it once it has none. Its cover is its first track's with cover art.
 */
const writeMusicAlbum = async (key: string, artistIds: Map<string, string>) => {
  const tracks = (await listTracks({ "music.albumKey": key })).sort(compareAlbumTracks);
  const saved = await models.MusicAlbumModel.findOne({ key }).lean();

  if (!tracks.length) {
    if (saved) {
      await models.MusicAlbumModel.deleteOne({ _id: saved._id }, metadataWriteOptions());
      socket.emitVolatile("onMusicAlbumDeleted", { ids: [String(saved._id)] });
    }

    return;
  }

  // An album belongs to its tracks' first artist, whose key groups them into it.
  const artistKey = tracks[0].music.artists[0].key;

  const fields: DerivedFields<models.MusicAlbumSchema> = {
    ...getTrackTotals(tracks),
    artistId: artistIds.get(artistKey) ?? (await writeMusicArtist(artistKey)),
    artistName: getMostCommon(tracks.map((track) => track.music.artists[0].name)),
    coverFileId: (tracks.find((track) => track.music.hasCover) ?? tracks[0]).id,
    name: getMostCommon(tracks.map((track) => track.music.album)),
    year: getMostCommon(tracks.map((track) => track.music.year)) ?? null,
  };

  if (saved) {
    const id = String(saved._id);
    const updates = getChangedFields(saved, fields);

    if (Object.keys(updates).length) {
      updates.dateModified = dayjs().toISOString();

      await models.MusicAlbumModel.updateOne(
        { _id: id },
        { $set: updates },
        metadataWriteOptions(),
      );
      socket.emitVolatile("onMusicAlbumUpdated", { id, updates });
    }
  } else {
    const dateCreated = dayjs().toISOString();
    const album = { ...fields, dateCreated, dateModified: dateCreated, key };
    const res = await new models.MusicAlbumModel(album).save(metadataSaveOptions());

    socket.emitVolatile("onMusicAlbumCreated", { ...album, id: res._id.toString() });
  }
};

/**
 * Rederives an artist from the tracks listed under them, creating the artist for their first track
 * and deleting them once they have none. Their albums are those they're the first artist of, and
 * their cover is from their latest album with one, or else from another of their tracks.
 */
const writeMusicArtist = async (key: string) => {
  const tracks = (await listTracks({ "music.artists.key": key })).sort(compareArtistTracks);
  const saved = await models.MusicArtistModel.findOne({ key }).lean();

  if (!tracks.length) {
    if (saved) {
      await models.MusicArtistModel.deleteOne({ _id: saved._id }, metadataWriteOptions());
      socket.emitVolatile("onMusicArtistDeleted", { ids: [String(saved._id)] });
    }

    return null;
  }

  const albumTracks = tracks.filter(
    (track) => track.music.albumKey && track.music.artists[0].key === key,
  );

  const fields: DerivedFields<models.MusicArtistSchema> = {
    ...getTrackTotals(tracks),
    albumCount: new Set(albumTracks.map((track) => track.music.albumKey)).size,
    coverFileId: (
      albumTracks.findLast((track) => track.music.hasCover) ??
      tracks.find((track) => track.music.hasCover) ??
      tracks[0]
    ).id,
    name: getMostCommon(
      tracks.map((track) => track.music.artists.find((artist) => artist.key === key).name),
    ),
  };

  if (saved) {
    const id = String(saved._id);
    const updates = getChangedFields(saved, fields);

    if (Object.keys(updates).length) {
      updates.dateModified = dayjs().toISOString();

      await models.MusicArtistModel.updateOne(
        { _id: id },
        { $set: updates },
        metadataWriteOptions(),
      );
      socket.emitVolatile("onMusicArtistUpdated", { id, updates });
    }

    return id;
  } else {
    const dateCreated = dayjs().toISOString();
    const artist = { ...fields, dateCreated, dateModified: dateCreated, key };
    const res = await new models.MusicArtistModel(artist).save(metadataSaveOptions());
    const id = res._id.toString();

    socket.emitVolatile("onMusicArtistCreated", { ...artist, id });

    return id;
  }
};

/**
 * Rederives a playlist's totals and cover from its files, dropping those deleted elsewhere. Given
 * files replace the saved ones.
 */
const writeMusicPlaylist = async (id: string, fileIds?: string[]) => {
  const saved = await models.MusicPlaylistModel.findById(id).lean();

  if (!saved) throw new Error("Playlist not found");

  const ids = [...new Set((fileIds ?? saved.fileIds).map(String))];
  const files = new Map(
    (await listTracks({ _id: { $in: objectIds(ids) } })).map((file) => [file.id, file]),
  );
  const tracks = ids.filter((fileId) => files.has(fileId)).map((fileId) => files.get(fileId));

  const updates = getChangedFields(saved, {
    ...getTrackTotals(tracks),
    coverFileId: (tracks.find((track) => track.music?.hasCover) ?? tracks[0])?.id ?? null,
  });

  if (Object.keys(updates).length) {
    updates.dateModified = dayjs().toISOString();

    await models.MusicPlaylistModel.updateOne(
      { _id: id },
      { $set: updates },
      metadataWriteOptions(),
    );
    socket.emitVolatile("onMusicPlaylistUpdated", { id, updates });
  }

  return leanModelToJson<models.MusicPlaylistSchema>(
    await models.MusicPlaylistModel.findById(id).lean(),
  );
};

/**
 * Rederives the artists, albums, and playlists holding the files, and those their music tags now
 * place them in, after the files were imported, refreshed, rated, transformed, or deleted.
 */
// @generator-ignore-export
export const regenMusicByFileIds = (fileIds: string[]) =>
  withMetadataMutation(async () => {
    if (!fileIds.length) return;

    const [files, albums, artists, playlists] = await Promise.all([
      models.FileModel.find({ _id: { $in: objectIds(fileIds) } })
        .select({ "music.albumKey": 1, "music.artists.key": 1 })
        .lean(),
      models.MusicAlbumModel.find({ fileIds: { $in: fileIds } })
        .select({ key: 1 })
        .lean(),
      models.MusicArtistModel.find({ fileIds: { $in: fileIds } })
        .select({ key: 1 })
        .lean(),
      models.MusicPlaylistModel.find({ fileIds: { $in: fileIds } })
        .select({ _id: 1 })
        .lean(),
    ]);

    const albumKeys = new Set(
      [...files.map((file) => file.music?.albumKey), ...albums.map(({ key }) => key)].filter(
        Boolean,
      ),
    );
    const artistKeys = new Set([
      ...files.flatMap((file) => file.music?.artists.map(({ key }) => key) ?? []),
      ...artists.map(({ key }) => key),
    ]);

    // Artists come first, so new albums can link theirs.
    const artistIds = new Map<string, string>();

    for (const key of artistKeys) {
      const id = await writeMusicArtist(key);
      if (id) artistIds.set(key, id);
    }

    for (const key of albumKeys) await writeMusicAlbum(key, artistIds);

    for (const playlist of playlists) await writeMusicPlaylist(String(playlist._id));
  });

/** Puts the file a duplicate was merged into in the duplicate's place in every playlist. */
// @generator-ignore-export
export const replaceMusicPlaylistFile = (fileId: string, replacementId: string) =>
  withMetadataMutation(async () => {
    const playlists = await models.MusicPlaylistModel.find({ fileIds: fileId })
      .select({ fileIds: 1 })
      .lean();

    for (const playlist of playlists)
      await writeMusicPlaylist(
        String(playlist._id),
        playlist.fileIds.map((id) => (String(id) === fileId ? replacementId : String(id))),
      );
  });

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
/** Adds the audio and video files a playlist doesn't have yet to its end, with how many it added. */
export const addFilesToMusicPlaylist = makeAction(
  async ({ fileIds, id }: { fileIds: string[]; id: string }) =>
    withMetadataMutation(async () => {
      const playlist = await models.MusicPlaylistModel.findById(id).select({ fileIds: 1 }).lean();

      if (!playlist) throw new Error("Playlist not found");

      const savedIds = playlist.fileIds.map(String);
      const savedIdSet = new Set(savedIds);
      const addedIds = (await listPlayableFileIds(fileIds)).filter(
        (fileId) => !savedIdSet.has(fileId),
      );

      return {
        addedCount: addedIds.length,
        playlist: await writeMusicPlaylist(id, [...savedIds, ...addedIds]),
      };
    }),
);

export const createMusicPlaylist = makeAction(
  async ({ fileIds = [], name }: { fileIds?: string[]; name: string }) =>
    withMetadataMutation(async () => {
      const trimmedName = name?.trim();

      if (!trimmedName) throw new Error("A name is required");

      const dateCreated = dayjs().toISOString();
      const playlist: Omit<models.MusicPlaylistSchema, "id"> = {
        dateCreated,
        dateModified: dateCreated,
        duration: 0,
        fileCount: 0,
        fileIds: [],
        name: trimmedName,
        rating: 0,
        size: 0,
      };

      const res = await new models.MusicPlaylistModel(playlist).save(metadataSaveOptions());
      const id = res._id.toString();

      socket.emitVolatile("onMusicPlaylistCreated", { ...playlist, id });

      return writeMusicPlaylist(id, await listPlayableFileIds(fileIds));
    }),
);

/** Deletes the playlists; their files stay in the library. */
export const deleteMusicPlaylists = makeAction(async ({ ids }: { ids: string[] }) =>
  withMetadataMutation(async () => {
    await models.MusicPlaylistModel.deleteMany(
      { _id: { $in: objectIds(ids) } },
      metadataWriteOptions(),
    );

    socket.emitVolatile("onMusicPlaylistDeleted", { ids });
  }),
);

/**
 * Creates a playlist named after each M3U or M3U8 file, with the tracks the library has at its
 * paths. Every file is read before any playlist is created, so one that can't be read creates none.
 */
export const importMusicPlaylists = makeAction(async ({ filePaths }: { filePaths: string[] }) => {
  const playlists: { fileIds: string[]; name: string; trackCount: number }[] = [];

  for (const filePath of filePaths) {
    try {
      const trackPaths = readM3uPlaylist(filePath, await fs.readFile(filePath));
      const fileIds = await findFileIdsByPath(trackPaths.filter(Boolean));

      playlists.push({ fileIds, name: path.parse(filePath).name, trackCount: trackPaths.length });
    } catch (error) {
      throw new Error(`${path.basename(filePath)}: ${error.message}`);
    }
  }

  for (const { fileIds, name } of playlists) {
    const res = await createMusicPlaylist({ fileIds, name });
    if (!res.success) throw new Error(res.error);
  }

  return {
    createdCount: playlists.length,
    missingCount: sumArray(playlists, (playlist) => playlist.trackCount - playlist.fileIds.length),
  };
});

/**
 * Reads the audio files' cover art and tags one after another in the order given, which callers
 * set to disk order, for the Import Editor's music preview.
 */
export const listAudioFileTags = makeAction(async ({ paths }: { paths: string[] }) => {
  const results: AudioFileTags[] = [];

  for (const filePath of paths) {
    try {
      const info = await getAudioInfo(filePath);

      results.push({
        error: null,
        hasCover: info.hasCover,
        musicTags: info.musicTags,
        path: filePath,
      });
    } catch (error) {
      results.push({ error: error.message, hasCover: false, musicTags: [], path: filePath });
    }
  }

  return results;
});

export const updateMusicPlaylist = makeAction(
  async ({
    expectedFileIds,
    id,
    updates,
  }: {
    /** The files an edit of the order was made from, which must still be the saved ones. */
    expectedFileIds?: string[];
    id: string;
    updates: Partial<Pick<models.MusicPlaylistSchema, "fileIds" | "name">>;
  }) =>
    withMetadataMutation(async () => {
      const playlist = await models.MusicPlaylistModel.findById(id).select({ fileIds: 1 }).lean();

      if (!playlist) throw new Error("Playlist not found");

      if (updates.name !== undefined && !updates.name.trim()) throw new Error("A name is required");

      // Saving an order edited from an outdated copy would undo files added since.
      if (expectedFileIds && !isDeepEqual(playlist.fileIds.map(String), expectedFileIds))
        throw new Error("This playlist changed elsewhere. Try again with its latest tracks.");

      if (updates.name !== undefined) {
        const changes = { dateModified: dayjs().toISOString(), name: updates.name.trim() };

        await models.MusicPlaylistModel.updateOne(
          { _id: id },
          { $set: changes },
          metadataWriteOptions(),
        );
        socket.emitVolatile("onMusicPlaylistUpdated", { id, updates: changes });
      }

      return writeMusicPlaylist(id, updates.fileIds?.map(String));
    }),
);
