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
  Text,
  View,
} from "medior/components";
import { MediaProgram, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import {
  MEDIA_PROGRAM_META_SOURCE_ORDER,
  MEDIA_PROGRAM_META_SOURCES,
  MediaProgramMetaMatch,
  MediaProgramMetaResult,
  MediaProgramMetaSource,
} from "medior/utils/common";

export interface MediaProgramMetaModalProps {
  onClose: () => void;
  program: MediaProgram;
}

/** Searches the public metadata sources and saves the chosen match to the program. */
export const MediaProgramMetaModal = Comp(({ onClose, program }: MediaProgramMetaModalProps) => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const { css } = useClasses(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState(program.name);
  const [results, setResults] = useState<MediaProgramMetaResult[]>([]);
  const [source, setSource] = useState<MediaProgramMetaSource>(
    program.meta?.source ?? MEDIA_PROGRAM_META_SOURCE_ORDER[0],
  );

  const searchRevision = useRef(0);

  const handleClear = () => saveMeta(null);

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  const handleSearch = () => search(source);

  const handleSelect = (result: MediaProgramMetaResult) =>
    saveMeta({ source: result.source, sourceId: result.sourceId });

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
  const search = async (searchSource: MediaProgramMetaSource) => {
    const revision = ++searchRevision.current;

    setIsSearching(true);

    const res = await store.searchMediaProgramMeta({ query, source: searchSource });
    if (revision !== searchRevision.current) return null;

    setIsSearching(false);

    if (!res.success) toast.error(res.error);
    else setResults(res.data);

    return res.success ? res.data : null;
  };

  /** Without a saved match, a first search that finds nothing tries the program's next source. */
  const searchDefault = async () => {
    const found = await search(source);

    if (!program.meta && found?.length === 0) {
      const next = MEDIA_PROGRAM_META_SOURCE_ORDER[1];

      setSource(next);
      search(next);
    }
  };

  useEffect(() => {
    searchDefault();
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

          <Button text="Search" icon="Search" onClick={handleSearch} disabled={!query.trim()} />
        </View>

        <View column flex={1} minHeight={0} position="relative" overflow="hidden auto">
          <LoadingOverlay isLoading={isSearching} />

          {results.length ? (
            results.map((result) => (
              <View
                key={result.sourceId}
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
            <CenteredText text={isSearching ? "" : "No matches found"} />
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
