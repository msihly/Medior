import { promises as fs } from "fs";
import path from "path";
import { fileLog } from "trabecula/utils/server";
import {
  dayjs,
  Fmt,
  MEDIA_PROGRAM_META_SOURCES,
  MediaProgramMeta,
  MediaProgramMetaMatch,
  MediaProgramMetaResult,
  MediaProgramMetaSource,
  sleep,
  sumArray,
} from "medior/utils/common";
import { getConfig } from "medior/utils/server/config";
import { runConcurrent } from "medior/utils/server/work-signal";

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

const TMDB_IMAGE_URL = "https://image.tmdb.org/t/p";

const TMDB_SEASON_CONCURRENCY = 4;

const TMDB_SITE_URL = "https://www.themoviedb.org";

const TMDB_URL = "https://api.themoviedb.org/3";

const TVDB_SITE_URL = "https://thetvdb.com";

/** TVDB's login tokens last a month, so they are renewed a few days before. */
const TVDB_TOKEN_MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000;

const TVDB_URL = "https://api4.thetvdb.com/v4";

const TVMAZE_URL = "https://api.tvmaze.com";

/** TVDB's login, shared by its requests until it is renewed or the key in Settings changes. */
let tvdbLogin: { credentials: string; date: number; token: Promise<string> } = null;

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

interface TmdbEpisode {
  air_date: string | null;
  episode_number: number;
  name: string | null;
  still_path: string | null;
}

interface TmdbMovie extends TmdbScored {
  backdrop_path: string | null;
  genres: { name: string }[];
  id: number;
  overview: string | null;
  poster_path: string | null;
  production_companies: { name: string }[];
  release_date: string | null;
  status: string | null;
  title: string;
}

interface TmdbScored {
  vote_average: number;
  vote_count: number;
}

interface TmdbSearchResult {
  first_air_date?: string | null;
  id: number;
  media_type: string;
  name?: string;
  overview: string | null;
  poster_path: string | null;
  release_date?: string | null;
  title?: string;
}

interface TmdbSeason {
  air_date: string | null;
  episodes: TmdbEpisode[];
  name: string | null;
  poster_path: string | null;
}

interface TmdbShow extends TmdbScored {
  backdrop_path: string | null;
  first_air_date: string | null;
  genres: { name: string }[];
  id: number;
  in_production: boolean;
  last_air_date: string | null;
  name: string;
  networks: { name: string }[];
  number_of_episodes: number | null;
  overview: string | null;
  poster_path: string | null;
  seasons: { season_number: number }[];
  status: string | null;
  type: string | null;
}

interface TvdbArtwork {
  image: string;
  score: number;
  type: number;
}

interface TvdbArtworkType {
  id: number;
  name: string | null;
  recordType: string | null;
}

interface TvdbEpisode {
  aired: string | null;
  image: string | null;
  name: string | null;
  number: number;
  seasonNumber: number;
}

interface TvdbMovie extends TvdbRecord {
  first_release: { date: string | null } | null;
  studios: { name: string }[] | null;
  year: string | null;
}

/** The details movies and series share. */
interface TvdbRecord {
  artworks: TvdbArtwork[] | null;
  genres: { name: string }[] | null;
  id: number;
  image: string | null;
  name: string;
  slug: string;
  status: { name: string | null } | null;
  translations: {
    nameTranslations: TvdbTranslation[] | null;
    overviewTranslations: TvdbTranslation[] | null;
  } | null;
}

interface TvdbSearchResult {
  image_url: string | null;
  name: string;
  overview: string | null;
  /** Overviews by language. */
  overviews: Record<string, string> | null;
  /** Names by language. */
  translations: Record<string, string> | null;
  tvdb_id: string;
  type: string;
  year: string | null;
}

interface TvdbSeason {
  image: string | null;
  name: string | null;
  number: number;
  type: { id: number } | null;
}

interface TvdbSeries extends TvdbRecord {
  defaultSeasonType: number;
  firstAired: string | null;
  lastAired: string | null;
  latestNetwork: { name: string } | null;
  nextAired: string | null;
  originalNetwork: { name: string } | null;
  overview: string | null;
  seasons: TvdbSeason[] | null;
}

interface TvdbTranslation {
  isPrimary: boolean;
  language: string;
  name: string | null;
  overview: string | null;
}

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
/** Nothing is sent to the sources, which are outside Medior's control, unless Settings allows it. */
const assertMetaLookups = () => {
  if (!getConfig().mediaPrograms.metaLookups)
    throw new Error("Metadata lookups are turned off in Media Programs settings");
};

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

/** A source's key from Settings, which it can't be used without. */
const getApiKey = (source: "tmdb" | "tvdb") => {
  const label = MEDIA_PROGRAM_META_SOURCES.find(({ value }) => value === source).label;

  const key = getConfig().mediaPrograms.apiKeys[source].trim();
  if (!key) throw new Error(`Set up ${label} under Metadata Sources in Media Programs settings`);
  return key;
};

/** TMDB gives image paths, which it serves at any of its sizes. */
const getTmdbImageUrl = (imagePath: string | null, size = "original") =>
  imagePath ? `${TMDB_IMAGE_URL}/${size}${imagePath}` : null;

/** TMDB rates out of 10, averaging 0 when nobody has voted. */
const getTmdbScore = ({ vote_average, vote_count }: TmdbScored) =>
  vote_count ? Math.round(vote_average * 10) : null;

/**
 * The record's most popular background, or else banner. TVDB numbers its artwork types, so they are
 * found by name in its list of them.
 */
const getTvdbBackdropUrl = (
  record: TvdbRecord,
  artworkTypes: TvdbArtworkType[],
  recordType: "movie" | "series",
) =>
  ["background", "banner"]
    .map((name) => {
      const typeIds = new Set(
        artworkTypes
          .filter((type) => type.recordType === recordType && type.name?.toLowerCase() === name)
          .map(({ id }) => id),
      );

      return (record.artworks ?? [])
        .filter(({ type }) => typeIds.has(type))
        .sort((a, b) => b.score - a.score)[0];
    })
    .find(Boolean)?.image ?? null;

const getTvdbToken = () => {
  const apiKey = getApiKey("tvdb");
  const pin = getConfig().mediaPrograms.apiKeys.tvdbPin.trim();
  const credentials = JSON.stringify([apiKey, pin]);

  if (
    tvdbLogin?.credentials !== credentials ||
    Date.now() - tvdbLogin.date > TVDB_TOKEN_MAX_AGE_MS
  ) {
    const token = loginTvdb(apiKey, pin);
    tvdbLogin = { credentials, date: Date.now(), token };

    // A failed login is tried again by the next request.
    token.catch(() => {
      if (tvdbLogin?.token === token) tvdbLogin = null;
    });
  }

  return tvdbLogin.token;
};

/** The English translation, or else the primary one. */
const getTvdbTranslation = (translations: TvdbTranslation[] | null) =>
  translations?.find(({ language }) => language === "eng") ??
  translations?.find(({ isPrimary }) => isPrimary);

const getTvMazeImageUrl = (image: TvMazeImage | null) => image?.original ?? image?.medium ?? null;

/** TVDB wants the PIN left out entirely for keys that have none. */
const loginTvdb = async (apikey: string, pin: string) => {
  const res = await requestJson<{ data: { token: string } }>(`${TVDB_URL}/login`, {
    body: JSON.stringify(pin ? { apikey, pin } : { apikey }),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
  });

  return res.data.token;
};

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

/** Sources limit request rates; a refused request waits as long as it is told, or 10s. */
const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    // Checked before each retry too, since lookups may be turned off while one waits.
    assertMetaLookups();

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

const requestTmdb = async <T>(urlPath: string) =>
  requestJson<T>(`${TMDB_URL}${urlPath}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${getApiKey("tmdb")}` },
  });

/** TVDB wraps each response's data, with links to the next page of a paged list. */
const requestTvdb = async <T>(urlPath: string) =>
  requestJson<{ data: T; links?: { next: string | null } }>(`${TVDB_URL}${urlPath}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${await getTvdbToken()}` },
  });

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

const toTmdbSeason = (season: TmdbSeason): SourceSeason => ({
  episodes: season.episodes.map((episode) => ({
    airDate: episode.air_date || null,
    number: episode.episode_number,
    stillUrl: getTmdbImageUrl(episode.still_path),
    title: episode.name || null,
  })),
  posterUrl: getTmdbImageUrl(season.poster_path),
  startDate: season.air_date || null,
  title: season.name || null,
});

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
      isMovie: first.format === "MOVIE",
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
/*                                    TMDB                                    */
/* -------------------------------------------------------------------------- */
const fetchTmdbMovie = async (id: number): Promise<SourceProgram> => {
  const movie = await requestTmdb<TmdbMovie>(`/movie/${id}`);

  return {
    bannerUrl: getTmdbImageUrl(movie.backdrop_path),
    details: {
      description: movie.overview || null,
      endDate: null,
      episodeCount: null,
      format: "Movie",
      genres: movie.genres.map(({ name }) => name),
      isMovie: true,
      network: movie.production_companies[0]?.name ?? null,
      score: getTmdbScore(movie),
      source: "tmdb",
      sourceId: movie.id,
      startDate: movie.release_date || null,
      status: movie.status || null,
      title: movie.title,
      url: `${TMDB_SITE_URL}/movie/${movie.id}`,
    },
    posterUrl: getTmdbImageUrl(movie.poster_path),
    seasons: new Map(),
  };
};

/** Episodes come from each season's own details, a few seasons at a time. */
const fetchTmdbShow = async (id: number): Promise<SourceProgram> => {
  const show = await requestTmdb<TmdbShow>(`/tv/${id}`);
  const seasons: SourceSeason[] = [];

  await runConcurrent(show.seasons, TMDB_SEASON_CONCURRENCY, async ({ season_number }, index) => {
    seasons[index] = toTmdbSeason(
      await requestTmdb<TmdbSeason>(`/tv/${id}/season/${season_number}`),
    );
  });

  return {
    bannerUrl: getTmdbImageUrl(show.backdrop_path),
    details: {
      description: show.overview || null,
      endDate: show.in_production ? null : show.last_air_date || null,
      episodeCount: show.number_of_episodes || null,
      format: show.type || null,
      genres: show.genres.map(({ name }) => name),
      isMovie: false,
      network: show.networks[0]?.name ?? null,
      score: getTmdbScore(show),
      source: "tmdb",
      sourceId: show.id,
      startDate: show.first_air_date || null,
      status: show.status || null,
      title: show.name,
      url: `${TMDB_SITE_URL}/tv/${show.id}`,
    },
    posterUrl: getTmdbImageUrl(show.poster_path),
    seasons: new Map(
      show.seasons.map(({ season_number }, index) => [season_number, seasons[index]]),
    ),
  };
};

/* -------------------------------------------------------------------------- */
/*                                    TVDB                                    */
/* -------------------------------------------------------------------------- */
/** Every episode in the series' default order, which TVDB lists a page at a time. */
const fetchTvdbEpisodes = async (id: number) => {
  const episodes: TvdbEpisode[] = [];

  for (let page = 0; ; page++) {
    const res = await requestTvdb<{ episodes: TvdbEpisode[] }>(
      `/series/${id}/episodes/default?page=${page}`,
    );

    episodes.push(...res.data.episodes);

    if (!res.links?.next || !res.data.episodes.length) return episodes;
  }
};

const fetchTvdbMovie = async (id: number): Promise<SourceProgram> => {
  const [{ data: movie }, { data: artworkTypes }] = await Promise.all([
    requestTvdb<TvdbMovie>(`/movies/${id}/extended?meta=translations`),
    requestTvdb<TvdbArtworkType[]>("/artwork/types"),
  ]);

  return {
    bannerUrl: getTvdbBackdropUrl(movie, artworkTypes, "movie"),
    details: {
      // Movies have no overview of their own, only translated ones.
      description: getTvdbTranslation(movie.translations?.overviewTranslations)?.overview || null,
      endDate: null,
      episodeCount: null,
      format: "Movie",
      genres: (movie.genres ?? []).map(({ name }) => name),
      isMovie: true,
      network: movie.studios?.[0]?.name ?? null,
      // TVDB's scores only hint at popularity.
      score: null,
      source: "tvdb",
      sourceId: movie.id,
      startDate: movie.first_release?.date || movie.year || null,
      status: movie.status?.name ?? null,
      title: getTvdbTranslation(movie.translations?.nameTranslations)?.name || movie.name,
      url: `${TVDB_SITE_URL}/movies/${movie.slug}`,
    },
    posterUrl: movie.image || null,
    seasons: new Map(),
  };
};

/**
 * Seasons gather the episodes of the series' default order. TVDB lists seasons for each of its
 * orders, so only those of the default order give the seasons their posters and names.
 */
const fetchTvdbSeries = async (id: number): Promise<SourceProgram> => {
  const [{ data: series }, { data: artworkTypes }, episodes] = await Promise.all([
    requestTvdb<TvdbSeries>(`/series/${id}/extended?meta=translations`),
    requestTvdb<TvdbArtworkType[]>("/artwork/types"),
    fetchTvdbEpisodes(id),
  ]);

  const seasonRecords = new Map<number, TvdbSeason>(
    (series.seasons ?? [])
      .filter((season) => season.type?.id === series.defaultSeasonType)
      .map((season) => [season.number, season]),
  );
  const seasonNumbers = [...new Set(episodes.map(({ seasonNumber }) => seasonNumber))].sort(
    (a, b) => a - b,
  );

  return {
    bannerUrl: getTvdbBackdropUrl(series, artworkTypes, "series"),
    details: {
      description:
        getTvdbTranslation(series.translations?.overviewTranslations)?.overview ||
        series.overview ||
        null,
      // A series with an episode still to air has not ended.
      endDate: series.nextAired ? null : series.lastAired || null,
      episodeCount: episodes.filter(({ seasonNumber }) => seasonNumber > 0).length || null,
      format: "Series",
      genres: (series.genres ?? []).map(({ name }) => name),
      isMovie: false,
      network: (series.originalNetwork ?? series.latestNetwork)?.name ?? null,
      score: null,
      source: "tvdb",
      sourceId: series.id,
      startDate: series.firstAired || null,
      status: series.status?.name ?? null,
      title: getTvdbTranslation(series.translations?.nameTranslations)?.name || series.name,
      url: `${TVDB_SITE_URL}/series/${series.slug}`,
    },
    posterUrl: series.image || null,
    seasons: new Map<number, SourceSeason>(
      seasonNumbers.map((number) => {
        const record = seasonRecords.get(number);
        const seasonEpisodes = episodes.filter((episode) => episode.seasonNumber === number);
        const airDates = seasonEpisodes
          .map(({ aired }) => aired)
          .filter(Boolean)
          .sort();

        return [
          number,
          {
            episodes: seasonEpisodes.map((episode) => ({
              airDate: episode.aired || null,
              number: episode.number,
              stillUrl: episode.image || null,
              title: episode.name || null,
            })),
            posterUrl: record?.image || null,
            startDate: airDates[0] ?? null,
            title: record?.name || (number === 0 ? "Specials" : null),
          },
        ];
      }),
    ),
  };
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
      isMovie: false,
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
/**
 * Saves an image into the folder, or returns null when it could not be downloaded. Lookups turned
 * off in Settings fail the download rather than skip it.
 */
export const downloadMediaProgramImage = async (
  url: string | null,
  folderPath: string,
  name: string,
) => {
  if (!url) return null;

  assertMetaLookups();

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
export const fetchMediaProgramSource = ({ isMovie, source, sourceId }: MediaProgramMetaMatch) => {
  if (source === "anilist") return fetchAniListProgram(sourceId);
  else if (source === "tmdb") return isMovie ? fetchTmdbMovie(sourceId) : fetchTmdbShow(sourceId);
  else if (source === "tvdb") return isMovie ? fetchTvdbMovie(sourceId) : fetchTvdbSeries(sourceId);
  else return fetchTvMazeProgram(sourceId);
};

/** Searches the source, passing the year to TVDB, whose search takes one. */
const searchSource = async (
  source: MediaProgramMetaSource,
  query: string,
  year: number | null,
): Promise<MediaProgramMetaResult[]> => {
  if (source === "anilist") {
    const data = await queryAniList<{ Page: { media: AniListSearchMedia[] } }>(
      ANILIST_SEARCH_QUERY,
      { search: query },
    );

    return data.Page.media.map((media) => ({
      description: toPlainText(media.description),
      format: formatAniListCode(media.format),
      isMovie: media.format === "MOVIE",
      posterUrl: media.coverImage.large,
      source,
      sourceId: media.id,
      title: getAniListTitle(media),
      year: media.startDate.year,
    }));
  } else if (source === "tmdb") {
    const { results } = await requestTmdb<{ results: TmdbSearchResult[] }>(
      `/search/multi?query=${encodeURIComponent(query)}`,
    );

    // Searching everything also finds people.
    return results
      .filter(({ media_type }) => media_type === "movie" || media_type === "tv")
      .map((result) => {
        const isMovie = result.media_type === "movie";
        const date = isMovie ? result.release_date : result.first_air_date;

        return {
          description: result.overview || null,
          format: isMovie ? "Movie" : "Series",
          isMovie,
          posterUrl: getTmdbImageUrl(result.poster_path, "w500"),
          source,
          sourceId: result.id,
          title: isMovie ? result.title : result.name,
          year: date ? dayjs(date).year() : null,
        };
      });
  } else if (source === "tvdb") {
    const { data } = await requestTvdb<TvdbSearchResult[]>(
      `/search?query=${encodeURIComponent(query)}${year ? `&year=${year}` : ""}`,
    );

    // Searches also find people and companies.
    return data
      .filter(({ type }) => type === "movie" || type === "series")
      .map((result) => ({
        description: result.overviews?.eng || result.overview || null,
        format: result.type === "movie" ? "Movie" : "Series",
        isMovie: result.type === "movie",
        posterUrl: result.image_url || null,
        source,
        sourceId: Number(result.tvdb_id),
        title: result.translations?.eng || result.name,
        year: result.year ? Number(result.year) : null,
      }));
  } else {
    const results = await requestJson<{ show: TvMazeShow }[]>(
      `${TVMAZE_URL}/search/shows?q=${encodeURIComponent(query)}`,
    );

    return results.map(({ show }) => ({
      description: toPlainText(show.summary),
      format: show.type,
      isMovie: false,
      posterUrl: getTvMazeImageUrl(show.image),
      source,
      sourceId: show.id,
      title: show.name,
      year: show.premiered ? dayjs(show.premiered).year() : null,
    }));
  }
};

/** The search's results, limited to those from the year when one is given. */
export const searchMediaProgramSource = async (
  source: MediaProgramMetaSource,
  query: string,
  year: number | null,
) => {
  const results = await searchSource(source, query, year);
  return year ? results.filter((result) => result.year === year) : results;
};
