import { Fmt } from "trabecula/utils/common";
import { naturalCompare } from "./media-programs";

/** An audio file's cover art and tags, read for the Import Editor's music preview. */
export interface AudioFileTags {
  /** Why the file couldn't be read, which its import would fail with too. */
  error: string | null;
  hasCover: boolean;
  musicTags: MusicTags[];
  path: string;
}

/**
 * A track's music tags from its file's metadata, with the keys that group it into its artists and
 * album. Audio files whose tags and name give no artist or album have none, so they stay out of
 * the library.
 */
export interface FileMusic {
  album: string | null;
  albumArtist: string | null;
  /** Groups an album's tracks under its first artist; tracks without an album belong to none. */
  albumKey: string | null;
  /** The track's whole artist credit, such as "22Bullets & Fedde Le Grand ft. JAMIE". */
  artist: string | null;
  /**
   * Every artist the track is listed under: its album artists, then its own main artists, then its
   * featured artists when its import lists them. The first one holds its album.
   */
  artists: MusicArtistCredit[];
  discNumber: number | null;
  genre: string | null;
  /** Whether the file has cover art, which albums and artists show before other tracks'. */
  hasCover: boolean;
  title: string | null;
  trackNumber: number | null;
  year: number | null;
}

/** The music an audio file's import would read, shown on its row in the Import Editor. */
export interface ImportMusicPreview {
  error: AudioFileTags["error"];
  /** Whether the file's name gave an artist or title its tags lack. */
  isFromName: boolean;
  music: FileMusic | null;
}

/** An artist a track is listed under, keyed so names differing only in case or spacing match. */
export interface MusicArtistCredit {
  key: string;
  name: string;
}

/**
 * How an import reads its audio files' music, chosen in the Import Editor's Music options. Files
 * keep them, so refreshing a file reads its music the same way again.
 */
export interface MusicImportOptions {
  /**
   * Album, album artist, disc, and track tags are left out, so each track is a loose track under
   * its artists, for libraries whose album tags only repeat the file's name.
   */
  ignoreAlbumTags: boolean;
  /** Featured artists list the track too, such as JAMIE for "22Bullets ft. JAMIE". */
  withFeaturedArtists: boolean;
  /** Names matching the name pattern stand in for missing artist and title tags. */
  withFileNames: boolean;
}

/** The Settings → Music values that reading a file's music follows. */
export interface MusicReadSettings {
  /**
   * Where file names give a missing artist and title, such as "{artist} - {title}". Spaces match
   * any spacing, and a dash matches en and em dashes too.
   */
  namePattern: string;
  /** Artist names never split into several artists, such as "Above & Beyond". */
  wholeArtists: string[];
}

/** The tags ffprobe gives a file's container or audio stream. */
export type MusicTags = Record<string, string | number>;

/** A track as music views list it. */
export type MusicTrack = { id: string; music?: FileMusic | null; originalName?: string };

/** Lists tracks with an album but no artist under one artist. */
export const UNKNOWN_ARTIST = "Unknown Artist";

/** Separators between artists credited together: "&", commas, "x", and "vs.". */
const ARTIST_SEPARATOR_REGEX = /(\s*,\s*|\s+(?:&|x|vs\.?)\s+)/i;

/** Featured artists, such as "ft. JAMIE" in "22Bullets & Fedde Le Grand ft. JAMIE". */
const FEATURED_ARTISTS_REGEX = /\s+[([]?(?:feat(?:uring)?|ft)\b\.?\s+(.+?)[)\]]?$/i;

/** The parts of a name pattern: its variables, and the spacing, dashes, and other text around them. */
const NAME_PATTERN_PART_REGEX = /(\{(?:artist|title)\})|\s+|[-–—]|[.*+?^${}()|[\]\\]/g;

const TAG_ALIASES = {
  album: ["album"],
  albumArtist: ["album_artist", "albumartist", "album artist"],
  artist: ["artist"],
  discNumber: ["disc", "discnumber"],
  genre: ["genre"],
  title: ["title"],
  trackNumber: ["track", "tracknumber"],
  year: ["date", "year", "originaldate"],
} satisfies Record<string, string[]>;

/** Tags placing a track on an album, which imports ignoring album tags leave out. */
const ALBUM_TAG_FIELDS: (keyof typeof TAG_ALIASES)[] = [
  "album",
  "albumArtist",
  "discNumber",
  "trackNumber",
];

/** Album order: by disc, then track number, with unnumbered tracks last by title. */
export const compareAlbumTracks = (a: MusicTrack, b: MusicTrack) =>
  (a.music?.discNumber ?? 1) - (b.music?.discNumber ?? 1) ||
  (a.music?.trackNumber ?? Infinity) - (b.music?.trackNumber ?? Infinity) ||
  naturalCompare(getMusicTrackTitle(a), getMusicTrackTitle(b));

/** An artist's tracks by album, oldest first, then in album order, with loose tracks last. */
export const compareArtistTracks = (a: MusicTrack, b: MusicTrack) =>
  Number(!a.music?.album) - Number(!b.music?.album) ||
  (a.music?.year ?? Infinity) - (b.music?.year ?? Infinity) ||
  naturalCompare(a.music?.album ?? "", b.music?.album ?? "") ||
  compareAlbumTracks(a, b);

/** A count with its noun, such as "1 Track" or "12 Tracks". */
export const getMusicCountLabel = (count: number, noun: string) =>
  `${Fmt.commas(count)} ${noun}${count === 1 ? "" : "s"}`;

/** Names differing only in case, spacing, or Unicode forms group together. */
export const getMusicKey = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** Tracks without a title tag go by their original name, which has no extension to strip. */
export const getMusicTrackTitle = (track: MusicTrack) =>
  track.music?.title || track.originalName || "";

/**
 * Moves each selected track one place earlier or later, past an unselected neighbor. Selected
 * tracks already at the start or end stay, as do those behind them.
 */
export const moveMusicTracks = (
  fileIds: string[],
  isSelected: (fileId: string) => boolean,
  down: boolean,
) => {
  const ids = [...fileIds];
  const indexes = ids.map((_, index) => index).filter((index) => isSelected(ids[index]));

  // The track leading the move goes first, so the others follow into the place it leaves.
  if (down) indexes.reverse();

  for (const index of indexes) {
    const target = down ? index + 1 : index - 1;

    if (target < 0 || target >= ids.length || isSelected(ids[target])) continue;

    [ids[index], ids[target]] = [ids[target], ids[index]];
  }

  return ids;
};

/**
 * The artists credited together, such as "22Bullets" and "Fedde Le Grand" in "22Bullets & Fedde
 * Le Grand". Names kept whole, such as "Above & Beyond", stay one artist.
 */
const splitArtistNames = (credit: string, keptWhole: Set<string>) => {
  // Names alternate with the separators between them, which a name kept whole joins back in.
  const parts = credit.split(ARTIST_SEPARATOR_REGEX);
  const names: string[] = [];
  let start = 0;

  const joinParts = (from: number, to: number) => parts.slice(from, to + 1).join("");

  while (start < parts.length) {
    let end = parts.length - 1;

    // The longest run of names forming one kept whole stays one artist.
    while (end > start && !keptWhole.has(getMusicKey(joinParts(start, end)))) end -= 2;

    names.push(joinParts(start, end).trim());
    start = end + 2;
  }

  return names.filter(Boolean);
};

/** A credit's main artists, followed by its featured ones when they're listed too. */
const readArtistCredit = (credit: string, keptWhole: Set<string>, withFeatured: boolean) => {
  const featured = credit.match(FEATURED_ARTISTS_REGEX);
  const main = featured ? credit.slice(0, featured.index) : credit;

  return [
    ...splitArtistNames(main, keptWhole),
    ...(withFeatured && featured ? splitArtistNames(featured[1], keptWhole) : []),
  ];
};

/**
 * The artist and title a file's name gives by the name pattern, such as "3LAU" and "Alive" for
 * "3LAU - Alive" by "{artist} - {title}". Each variable takes as little of the name as the rest of
 * the pattern allows, so the title takes everything after the first dash.
 */
const readNamePattern = (fileName: string, pattern: string) => {
  const variables: string[] = [];

  const source = pattern.trim().replace(NAME_PATTERN_PART_REGEX, (part, variable: string) => {
    if (variable) {
      variables.push(variable.slice(1, -1));
      return "(.+?)";
    } else if (/^\s+$/.test(part)) return "\\s+";
    else if (/^[-–—]$/.test(part)) return "[-–—]";
    else return `\\${part}`;
  });

  const match = fileName.match(new RegExp(`^${source}$`));
  if (!match) return null;

  const values = new Map(variables.map((variable, index) => [variable, match[index + 1].trim()]));
  return { artist: values.get("artist") ?? null, title: values.get("title") ?? null };
};

/**
 * Reads the tags ffprobe gives the container and audio stream, whose names vary by format, such as
 * "album_artist" in MP3s and "ALBUMARTIST" in FLACs. Numbers like "3/12" give their first part.
 * When the options allow, names matching the name pattern, as flat libraries use, stand in for
 * missing artist and title tags; a number where the artist would be is a track number instead.
 */
export const parseFileMusic = ({
  fileName,
  hasCover,
  options,
  settings,
  tagSets,
}: {
  /** The name the file was imported under, which has no extension. */
  fileName: string;
  hasCover: boolean;
  options: MusicImportOptions;
  settings: MusicReadSettings;
  tagSets: MusicTags[];
}): FileMusic | null => {
  const tags = new Map<string, string>();

  for (const tagSet of tagSets) {
    for (const [key, value] of Object.entries(tagSet ?? {})) {
      const text = String(value ?? "").trim();
      if (text && !tags.has(key.toLowerCase())) tags.set(key.toLowerCase(), text);
    }
  }

  const getText = (field: keyof typeof TAG_ALIASES) =>
    options.ignoreAlbumTags && ALBUM_TAG_FIELDS.includes(field)
      ? null
      : (TAG_ALIASES[field].map((alias) => tags.get(alias)).find(Boolean) ?? null);

  const getNumber = (field: keyof typeof TAG_ALIASES) => {
    const number = parseInt(getText(field), 10);
    return number > 0 ? number : null;
  };

  const fromName = options.withFileNames
    ? readNamePattern(fileName ?? "", settings.namePattern)
    : null;
  const nameArtist = fromName?.artist && !/^\d+$/.test(fromName.artist) ? fromName.artist : null;

  const album = getText("album");
  const albumArtist = getText("albumArtist");
  const artist = getText("artist") ?? nameArtist;
  const keptWhole = new Set(settings.wholeArtists.map(getMusicKey));

  // Album artists come first, so the album is listed under them.
  const names = [
    ...(albumArtist ? readArtistCredit(albumArtist, keptWhole, false) : []),
    ...(artist ? readArtistCredit(artist, keptWhole, options.withFeaturedArtists) : []),
  ];
  const artists = (names.length ? names : album ? [UNKNOWN_ARTIST] : [])
    .map((name) => ({ key: getMusicKey(name), name }))
    .filter(
      (credit, index, credits) => credits.findIndex(({ key }) => key === credit.key) === index,
    );

  if (!artists.length) return null;

  // The name's title follows its artist, so it stands in only when that artist is the track's.
  const nameTitle =
    !fromName?.artist || getMusicKey(fromName.artist) === getMusicKey(artist ?? "")
      ? fromName?.title
      : null;
  const title = getText("title") ?? nameTitle ?? null;

  const year = Number(getText("year")?.match(/\b\d{4}\b/)?.[0]);

  return {
    album,
    albumArtist,
    albumKey: album ? `${artists[0].key}\n${getMusicKey(album)}` : null,
    artist,
    artists,
    discNumber: getNumber("discNumber"),
    genre: getText("genre"),
    hasCover,
    title,
    trackNumber: getNumber("trackNumber"),
    year: year > 0 ? year : null,
  };
};
