import { useEffect, useRef, useState } from "react";
import {
  Button,
  CenteredText,
  Comp,
  Dropdown,
  FileBase,
  Icon,
  Input,
  LoadingOverlay,
  Modal,
  NumInput,
  Text,
  View,
} from "medior/components";
import { MediaProgram, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import {
  getIsMediaProgramMetaKind,
  getMediaProgramMetaKind,
  getMediaProgramMetaSourceOrder,
  MEDIA_PROGRAM_META_SOURCES,
  MediaProgramMetaKind,
  MediaProgramMetaMatch,
  MediaProgramMetaResult,
  MediaProgramMetaSource,
} from "medior/utils/common";
import { getConfig } from "medior/utils/server";

const LOOKUPS_OFF_TEXT =
  "Metadata lookups are off. They send program titles to servers outside Medior's control, so they only run once turned on under Metadata Sources in Media Programs settings.";

const RESULT_SORTS = [
  { label: "Best Match", value: "match" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
] as const;

const RESULT_TYPES: { label: string; value: MediaProgramMetaKind | null }[] = [
  { label: "All", value: null },
  { label: "Movies", value: "movie" },
  { label: "Series", value: "series" },
];

type ResultSort = (typeof RESULT_SORTS)[number]["value"];

export interface MediaProgramMetaModalProps {
  onClose: () => void;
  program: MediaProgram;
}

/** The results of the kind, in the chosen order, with those without a year last by year. */
const getShownResults = (
  results: MediaProgramMetaResult[],
  kind: MediaProgramMetaKind | null,
  sort: ResultSort,
) => {
  const shown = results.filter((result) => getIsMediaProgramMetaKind(result, kind));

  return sort === "match"
    ? shown
    : shown.sort((a, b) => {
        if (!a.year || !b.year) return Number(!a.year) - Number(!b.year);
        else return sort === "newest" ? b.year - a.year : a.year - b.year;
      });
};

/** Searches the public metadata sources and saves the chosen match to the program. */
export const MediaProgramMetaModal = Comp(({ onClose, program }: MediaProgramMetaModalProps) => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const { css } = useClasses(null);

  const { apiKeys, metaLookups } = getConfig().mediaPrograms;
  const sourceOrder = getMediaProgramMetaSourceOrder(apiKeys);

  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [kind, setKind] = useState(getMediaProgramMetaKind(program));
  const [query, setQuery] = useState(program.name);
  const [results, setResults] = useState<MediaProgramMetaResult[]>([]);
  const [sort, setSort] = useState<ResultSort>("match");
  const [source, setSource] = useState<MediaProgramMetaSource>(
    program.meta?.source ?? sourceOrder[0],
  );
  const [year, setYear] = useState<number>(program.year ?? null);

  const searchRevision = useRef(0);

  const shownResults = getShownResults(results, kind, sort);

  const handleClear = () => saveMeta(null);

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const handleSearch = () => search(source);

  const handleSelect = (result: MediaProgramMetaResult) =>
    saveMeta({ isMovie: result.isMovie, source: result.source, sourceId: result.sourceId });

  const handleSource = (value: MediaProgramMetaSource) => {
    setSource(value);
    search(value);
  };

  /** Saves the match, or clears the program's metadata without one, closing once saved. */
  const saveMeta = async (match: MediaProgramMetaMatch | null) => {
    setIsSaving(true);

    try {
      const res = await store.setMediaProgramMeta({ id: program.id, match });
      if (!res.success) toast.error(res.error);
      else onClose();
    } finally {
      setIsSaving(false);
    }
  };

  /** Results of a search replaced by a newer one are dropped. */
  const search = async (searchSource: MediaProgramMetaSource, searchYear = year) => {
    if (!metaLookups) return null;

    const revision = ++searchRevision.current;

    setIsSearching(true);

    const res = await store.searchMediaProgramMeta({
      query,
      source: searchSource,
      year: searchYear,
    });
    if (revision !== searchRevision.current) return null;

    setIsSearching(false);

    if (!res.success) toast.error(res.error);
    else setResults(res.data);

    return res.success ? res.data : null;
  };

  /**
   * Searches like matching does: without a saved match, each source in turn until one finds a
   * result of the program's kind, or else the first source that found one of another kind, shown
   * with every kind. A program with a year is searched for in that year at every source before any
   * is searched without it.
   */
  const searchDefault = async () => {
    for (const searchYear of program.year ? [program.year, null] : [null]) {
      let otherKind: { found: MediaProgramMetaResult[]; source: MediaProgramMetaSource } = null;

      setYear(searchYear);

      for (const next of program.meta ? [source] : sourceOrder) {
        setSource(next);

        const found = await search(next, searchYear);
        if (!found || found.some((result) => getIsMediaProgramMetaKind(result, kind))) return;

        if (!otherKind && found.length) otherKind = { found, source: next };
      }

      if (otherKind) {
        setKind(null);
        setResults(otherKind.found);
        setSource(otherKind.source);
        return;
      }
    }
  };

  useEffect(() => {
    searchDefault();

    // Closing ends the first search, so it contacts no further sources.
    return () => {
      searchRevision.current += 1;
    };
  }, []);

  return (
    <Modal.Container isLoading={isSaving} onClose={handleClose} height="90%" width="50rem">
      <Modal.Header>
        <Text preset="title">{"Match Metadata"}</Text>
      </Modal.Header>

      <Modal.Content overflow="hidden">
        <View row align="flex-end" spacing="0.5rem">
          <Dropdown
            header="Source"
            options={[...MEDIA_PROGRAM_META_SOURCES]}
            value={source}
            setValue={handleSource}
            width="10rem"
          />

          <View column flex={1}>
            <Input header="Title" value={query} setValue={setQuery} onEnter={handleSearch} />
          </View>

          <NumInput
            header="Year"
            value={year}
            setValue={setYear}
            onEnter={handleSearch}
            width="6rem"
          />

          <Button
            text="Search"
            icon="Search"
            onClick={handleSearch}
            disabled={!metaLookups || !query.trim()}
          />
        </View>

        <View row spacing="0.5rem">
          <Dropdown
            header="Type"
            options={RESULT_TYPES}
            value={kind}
            setValue={setKind}
            width="10rem"
          />

          <Dropdown
            header="Sort"
            options={[...RESULT_SORTS]}
            value={sort}
            setValue={setSort}
            width="10rem"
          />
        </View>

        <View column flex={1} minHeight={0} position="relative" overflow="hidden auto">
          <LoadingOverlay isLoading={isSearching} />

          {shownResults.length ? (
            shownResults.map((result) => (
              <View
                key={`${result.isMovie ? "movie" : "series"}-${result.sourceId}`}
                row
                spacing="0.8rem"
                padding={{ all: "0.5rem" }}
                borderRadiuses={{ all: "0.5rem" }}
                cursor="pointer"
                onClick={() => handleSelect(result)}
                className={css.result}
              >
                <View
                  column
                  flex="none"
                  width="5rem"
                  height="7.5rem"
                  overflow="hidden"
                  bgColor={colors.foregroundCard}
                  borderRadiuses={{ all: "0.3rem" }}
                >
                  {result.posterUrl ? (
                    <FileBase.Image
                      thumb={{ path: result.posterUrl }}
                      title={result.title}
                      fit="cover"
                    />
                  ) : (
                    <View column flex={1} align="center" justify="center">
                      <Icon name="LiveTv" size="2rem" color={colors.custom.grey} />
                    </View>
                  )}
                </View>

                <View column flex={1} minWidth={0} spacing="0.3rem">
                  <Text fontWeight={600} fontSize="1.1em" whiteSpace="normal">
                    {result.title}
                  </Text>

                  <Text color={colors.custom.lightBlue}>
                    {[result.year, result.format].filter(Boolean).join(" · ")}
                  </Text>

                  {result.description && (
                    <Text
                      color={colors.custom.lightGrey}
                      whiteSpace="normal"
                      className={css.description}
                    >
                      {result.description}
                    </Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <CenteredText
              text={!metaLookups ? LOOKUPS_OFF_TEXT : isSearching ? "" : "No matches found"}
              whiteSpace="normal"
              textAlign="center"
            />
          )}
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />

        {program.meta && (
          <Button
            text="Clear Metadata"
            icon="LinkOff"
            onClick={handleClear}
            colorOnHover={colors.custom.red}
          />
        )}
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  description: {
    display: "-webkit-box",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  result: {
    "&:hover": {
      backgroundColor: colors.foregroundCard,
    },
  },
});
