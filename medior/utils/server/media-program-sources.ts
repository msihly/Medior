import { promises as fs } from "fs";
import path from "path";
import { fileLog } from "trabecula/utils/server";
import {
  dayjs,
  Fmt,
  MediaProgramMeta,
  MediaProgramMetaResult,
  MediaProgramMetaSource,
  sleep,
  sumArray,
} from "medior/utils/common";

const ANILIST_ABBREVIATIONS = ["ONA", "OVA", "TV"];

const ANILIST_MEDIA_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    airingSchedule(perPage: 50) { nodes { airingAt episode } }
    averageScore
    bannerImage
    coverImage { extraLarge large }
    description(asHtml: false)
    endDate { day month year }
    episodes
    format
    genres
    id
    relations { edges { node { format id type } relationType } }
    siteUrl
    startDate { day month year }
    status
    streamingEpisodes { thumbnail title }
    studios(isMain: true) { nodes { name } }
    title { english romaji }
  }
}`;

const ANILIST_SEARCH_QUERY = `query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, sort: SEARCH_MATCH, type: ANIME) {
      coverImage { large }
      description(asHtml: false)
      format
      id
      startDate { year }
      title { english romaji }
    }
  }
}`;

const ANILIST_SEASON_FORMATS = ["ONA", "TV", "TV_SHORT"];

const ANILIST_URL = "https://graphql.anilist.co";

const IMAGE_EXTS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const IMAGE_TIMEOUT_MS = 60_000;

/** AniList seasons are followed through sequels, stopping after this many. */
const MAX_ANILIST_SEASONS = 30;

const MAX_ATTEMPTS = 4;

const REQUEST_TIMEOUT_MS = 30_000;

const STREAMING_EPISODE_REGEX = /^Episode\s+(\d+)\s*(?:-\s*(.*))?$/i;

const TVMAZE_URL = "https://api.tvmaze.com";

interface AniListDate {
  day?: number | null;
  month?: number | null;
  year: number | null;
}

interface AniListMedia {
  airingSchedule: { nodes: { airingAt: number; episode: number }[] };
  averageScore: number | null;
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null };
  description: string | null;
  endDate: AniListDate;
  episodes: number | null;
  format: string | null;
  genres: string[];
  id: number;
  relations: {
    edges: { node: { format: string | null; id: number; type: string }; relationType: string }[];
  };
  siteUrl: string;
  startDate: AniListDate;
  status: string | null;
  streamingEpisodes: { thumbnail: string | null; title: string | null }[];
  studios: { nodes: { name: string }[] };
  title: { english: string | null; romaji: string | null };
}

type AniListSearchMedia = Pick<AniListMedia, "description" | "format" | "id" | "title"> & {
  coverImage: { large: string | null };
  startDate: AniListDate;
};

interface TvMazeEpisode {
  airdate: string | null;
  image: TvMazeImage | null;
  name: string | null;
  number: number | null;
  season: number;
}

interface TvMazeImage {
  medium: string | null;
  original: string | null;
}

interface TvMazeSeason {
  image: TvMazeImage | null;
  name: string | null;
  number: number;
  premiereDate: string | null;
}

interface TvMazeShow {
  _embedded?: { seasons: TvMazeSeason[] };
  ended: string | null;
  genres: string[];
  id: number;
  image: TvMazeImage | null;
  name: string;
  network: { name: string } | null;
  premiered: string | null;
  rating: { average: number | null };
  status: string | null;
  summary: string | null;
  type: string | null;
  url: string;
  webChannel: { name: string } | null;
}

interface TvMazeShowImage {
  main: boolean;
  resolutions: { original: { url: string } };
  type: string;
}

/** An episode's details from its source, with its remote still until it is downloaded. */
export interface SourceEpisode {
  airDate: string | null;
  number: number;
  stillUrl: string | null;
  title: string | null;
}

/** A program's details from its source, with remote images until they are downloaded. */
export interface SourceProgram {
  bannerUrl: string | null;
  details: Omit<MediaProgramMeta, "bannerPath" | "posterPath" | "seasons">;
  posterUrl: string | null;
  /** Seasons by their number, with specials as season 0. */
  seasons: Map<number, SourceSeason>;
}

/** A season's details from its source, with remote images until they are downloaded. */
export interface SourceSeason {
  episodes: SourceEpisode[];
  posterUrl: string | null;
  startDate: string | null;
  title: string | null;
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
/** AniList codes such as NOT_YET_RELEASED as words, keeping abbreviations such as TV. */
const formatAniListCode = (code: string | null) =>
  code
    ? code
        .split("_")
        .map((word) =>
          ANILIST_ABBREVIATIONS.includes(word) ? word : Fmt.capitalize(word.toLowerCase()),
        )
        .join(" ")
    : null;

const formatAniListDate = (date: AniListDate) => {
  if (!date?.year) return null;
  else if (!date.month) return String(date.year);
  else if (!date.day) return `${date.year}-${Fmt.leadZeros(date.month, 2)}`;
  else return `${date.year}-${Fmt.leadZeros(date.month, 2)}-${Fmt.leadZeros(date.day, 2)}`;
};

/** The next season of an anime, which AniList lists as a sequel. */
const getAniListSequelId = (media: AniListMedia) =>
  media.relations.edges.find(
    ({ node, relationType }) =>
      relationType === "SEQUEL" &&
      node.type === "ANIME" &&
      ANILIST_SEASON_FORMATS.includes(node.format),
  )?.node.id ?? null;

const getAniListTitle = (media: Pick<AniListMedia, "title">) =>
  media.title.english ?? media.title.romaji;

const getTvMazeImageUrl = (image: TvMazeImage | null) => image?.original ?? image?.medium ?? null;

/** AniList reports GraphQL errors, such as an unknown ID, in the body of a failed response. */
const readErrorMessage = async (res: Response) => {
  try {
    return ((await res.json()) as { errors?: { message: string }[] })?.errors?.[0]?.message ?? null;
  } catch {
    return null;
  }
};

const queryAniList = async <T>(query: string, variables: Record<string, unknown>) => {
  const res = await requestJson<{ data: T; errors?: { message: string }[] }>(ANILIST_URL, {
    body: JSON.stringify({ query, variables }),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
  });

  if (res.errors?.length) throw new Error(`AniList: ${res.errors[0].message}`);

  return res.data;
};

/** Both sources limit requests per minute; a refused request waits as long as it is told, or 10s. */
const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after"));

      await sleep((retryAfter > 0 ? retryAfter : 10) * 1000);
    } else if (!res.ok) {
      const message = await readErrorMessage(res);

      throw new Error(`${url} responded with HTTP ${res.status}${message ? `: ${message}` : ""}`);
    } else return (await res.json()) as T;
  }
};

/** Sources describe programs in HTML, of which only the line breaks are kept. */
const toPlainText = (html: string | null) => {
  const text = Fmt.decodeHtmlEntities(
    (html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
};

const toTvMazeEpisode = (episode: TvMazeEpisode, number = episode.number): SourceEpisode => ({
  airDate: episode.airdate || null,
  number,
  stillUrl: getTvMazeImageUrl(episode.image),
  title: episode.name || null,
});

/* -------------------------------------------------------------------------- */
/*                                   ANILIST                                  */
/* -------------------------------------------------------------------------- */
const fetchAniListMedia = async (id: number) =>
  (await queryAniList<{ Media: AniListMedia }>(ANILIST_MEDIA_QUERY, { id })).Media;

/**
 * AniList lists each season separately, so the matched anime is season 1 and its sequels follow,
 * including those the program has no files for.
 */
const fetchAniListProgram = async (id: number): Promise<SourceProgram> => {
  const chain = [await fetchAniListMedia(id)];

  while (chain.length < MAX_ANILIST_SEASONS) {
    const sequelId = getAniListSequelId(chain.at(-1));
    if (!sequelId) break;

    chain.push(await fetchAniListMedia(sequelId));
  }

  const [first] = chain;
  const last = chain.at(-1);

  return {
    bannerUrl: first.bannerImage,
    details: {
      description: toPlainText(first.description),
      endDate: formatAniListDate(last.endDate),
      episodeCount: chain.some((media) => media.episodes)
        ? sumArray(chain, (media) => media.episodes ?? 0)
        : null,
      format: formatAniListCode(first.format),
      genres: first.genres,
      network: first.studios.nodes[0]?.name ?? null,
      score: first.averageScore,
      source: "anilist",
      sourceId: first.id,
      startDate: formatAniListDate(first.startDate),
      status: formatAniListCode(last.status),
      title: getAniListTitle(first),
      url: first.siteUrl,
    },
    posterUrl: first.coverImage.extraLarge ?? first.coverImage.large,
    seasons: new Map(
      chain.map((media, index) => [
        index + 1,
        {
          episodes: readAniListEpisodes(media),
          posterUrl: media.coverImage.extraLarge ?? media.coverImage.large,
          startDate: formatAniListDate(media.startDate),
          title: getAniListTitle(media),
        },
      ]),
    ),
  };
};

/**
 * Episode dates come from the airing schedule, and titles and stills from streaming listings. The
 * episode count fills in the rest, so every episode is listed.
 */
const readAniListEpisodes = (media: AniListMedia) => {
  const episodes = new Map<number, SourceEpisode>();

  for (let number = 1; number <= (media.episodes ?? 0); number++)
    episodes.set(number, { airDate: null, number, stillUrl: null, title: null });

  for (const { airingAt, episode } of media.airingSchedule.nodes)
    episodes.set(episode, {
      airDate: dayjs.unix(airingAt).format("YYYY-MM-DD"),
      number: episode,
      stillUrl: null,
      title: null,
    });

  for (const { thumbnail, title } of media.streamingEpisodes) {
    const match = title?.match(STREAMING_EPISODE_REGEX);
    if (!match) continue;

    const number = Number(match[1]);

    episodes.set(number, {
      airDate: episodes.get(number)?.airDate ?? null,
      number,
      stillUrl: thumbnail || null,
      title: match[2]?.trim() || null,
    });
  }

  return [...episodes.values()].sort((a, b) => a.number - b.number);
};

/* -------------------------------------------------------------------------- */
/*                                   TVMAZE                                   */
/* -------------------------------------------------------------------------- */
const fetchTvMazeProgram = async (id: number): Promise<SourceProgram> => {
  const [show, episodes, images] = await Promise.all([
    requestJson<TvMazeShow>(`${TVMAZE_URL}/shows/${id}?embed[]=seasons`),
    // Episode lists leave specials out unless asked for them.
    requestJson<TvMazeEpisode[]>(`${TVMAZE_URL}/shows/${id}/episodes?specials=1`),
    requestJson<TvMazeShowImage[]>(`${TVMAZE_URL}/shows/${id}/images`),
  ]);

  const backdrop = ["background", "banner"]
    .map(
      (type) =>
        images.find((image) => image.type === type && image.main) ??
        images.find((image) => image.type === type),
    )
    .find(Boolean);

  const numberedEpisodes = episodes.filter((episode) => episode.number !== null);
  // Specials have no number, so they gather into season 0 in the order they aired.
  const specials = episodes.filter((episode) => episode.number === null);

  const seasons = new Map<number, SourceSeason>(
    (show._embedded?.seasons ?? []).map((season) => [
      season.number,
      {
        episodes: numberedEpisodes
          .filter((episode) => episode.season === season.number)
          .map((episode) => toTvMazeEpisode(episode)),
        posterUrl: getTvMazeImageUrl(season.image),
        startDate: season.premiereDate,
        title: season.name || null,
      },
    ]),
  );

  if (specials.length)
    seasons.set(0, {
      episodes: specials.map((episode, index) => toTvMazeEpisode(episode, index + 1)),
      posterUrl: null,
      startDate: specials[0].airdate || null,
      title: "Specials",
    });

  return {
    bannerUrl: backdrop?.resolutions.original.url ?? null,
    details: {
      description: toPlainText(show.summary),
      endDate: show.ended,
      episodeCount: numberedEpisodes.length || null,
      format: show.type,
      genres: show.genres,
      network: show.network?.name ?? show.webChannel?.name ?? null,
      score: show.rating.average === null ? null : Math.round(show.rating.average * 10),
      source: "tvmaze",
      sourceId: show.id,
      startDate: show.premiered,
      status: show.status,
      title: show.name,
      url: show.url,
    },
    posterUrl: getTvMazeImageUrl(show.image),
    seasons,
  };
};

/* -------------------------------------------------------------------------- */
/*                                   EXPORTS                                  */
/* -------------------------------------------------------------------------- */
/** Saves an image into the folder, or returns null when it could not be downloaded. */
export const downloadMediaProgramImage = async (
  url: string | null,
  folderPath: string,
  name: string,
) => {
  if (!url) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type")?.split(";")[0].trim();
    const ext =
      IMAGE_EXTS[contentType] ??
      (path.extname(new URL(url).pathname).slice(1).toLowerCase() || "jpg");
    const imagePath = path.join(folderPath, `${name}.${ext}`);

    await fs.writeFile(imagePath, Buffer.from(await res.arrayBuffer()));

    return imagePath;
  } catch (error) {
    fileLog(`Failed to download media program image ${url}: ${error.message}`, { type: "error" });

    return null;
  }
};

/** The program's details and every season the source lists. */
export const fetchMediaProgramSource = (source: MediaProgramMetaSource, sourceId: number) =>
  source === "anilist" ? fetchAniListProgram(sourceId) : fetchTvMazeProgram(sourceId);

export const searchMediaProgramSource = async (
  source: MediaProgramMetaSource,
  query: string,
): Promise<MediaProgramMetaResult[]> => {
  if (source === "anilist") {
    const data = await queryAniList<{ Page: { media: AniListSearchMedia[] } }>(
      ANILIST_SEARCH_QUERY,
      { search: query },
    );

    return data.Page.media.map((media) => ({
      description: toPlainText(media.description),
      format: formatAniListCode(media.format),
      posterUrl: media.coverImage.large,
      source,
      sourceId: media.id,
      title: getAniListTitle(media),
      year: media.startDate.year,
    }));
  } else {
    const results = await requestJson<{ show: TvMazeShow }[]>(
      `${TVMAZE_URL}/search/shows?q=${encodeURIComponent(query)}`,
    );

    return results.map(({ show }) => ({
      description: toPlainText(show.summary),
      format: show.type,
      posterUrl: getTvMazeImageUrl(show.image),
      source,
      sourceId: show.id,
      title: show.name,
      year: show.premiered ? dayjs(show.premiered).year() : null,
    }));
  }
};
