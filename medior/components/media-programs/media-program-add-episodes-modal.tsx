import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import {
  Button,
  CardGrid,
  Comp,
  FileCard,
  FileFilter,
  Modal,
  Pagination,
  SearchLoadingOverlay,
  SelectionButtons,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export interface MediaProgramAddEpisodesModalProps {
  setVisible: Dispatch<SetStateAction<boolean>>;
}

/**
 * Searches the library for files to add to the shown season, such as episodes imported apart from
 * it. They take the numbers their names give and leave the program's other seasons.
 */
export const MediaProgramAddEpisodesModal = Comp(
  ({ setVisible }: MediaProgramAddEpisodesModalProps) => {
    const stores = useStores();
    const store = stores.mediaProgram.editor.fileSearch;

    const [isSaving, setIsSaving] = useState(false);

    const filesRef = useRef<HTMLDivElement>(null);

    const seasonLabel = stores.mediaProgram.editor.activeSeason?.label || "Untitled Season";
    const selectedCount = store.selectedIds.length;

    const handleAdd = async () => {
      setIsSaving(true);

      try {
        const res = await stores.mediaProgram.editor.addEpisodes([...store.selectedIds]);
        if (!res.success) toast.error(res.error);
        else setVisible(false);
      } finally {
        setIsSaving(false);
      }
    };

    const handleClose = () => {
      if (!isSaving) setVisible(false);
    };

    const handleFullPageLoad = () => store.loadFiltered({ toLastPage: true });

    /** The new page starts at the top of the results. */
    const handlePageChange = async (page: number) => {
      const res = await store.loadFiltered({ page });
      if (!res.success) toast.error(res.error);
      else filesRef.current?.scrollTo({ behavior: "instant", top: 0 });
    };

    const handleSearch = async () => {
      const res = await stores.mediaProgram.editor.loadFileSearch();
      if (!res.success) toast.error(res.error);
    };

    useEffect(() => {
      handleSearch();
    }, []);

    return (
      <Modal.Container isLoading={isSaving} onClose={handleClose} height="90%" width="90%">
        <SearchLoadingOverlay store={store} />

        <Modal.Header
          leftNode={<FileFilter.Menu store={store} onSearch={handleSearch} />}
          rightNode={
            <View row align="center" spacing="0.3rem">
              <SelectionButtons itemLabel="files" store={store} toast={toast} />
            </View>
          }
        >
          <Text preset="title">{`Add Episodes: ${seasonLabel}`}</Text>
        </Modal.Header>

        <Modal.Content dividers={false} overflow="hidden" padding={{ all: 0 }} spacing={0}>
          <CardGrid
            ref={filesRef}
            padding={{ all: "0.3rem" }}
            cards={store.results.map((file) => (
              <FileCard key={file.id} file={file} store={store} />
            ))}
            noResultsText={store.isLoading ? "" : "No files found"}
          />

          <Pagination
            inline
            count={store.pageCount}
            page={store.page}
            onChange={handlePageChange}
            onFullLoad={handleFullPageLoad}
            isLoading={store.isPageCountLoading && !store.isLoading}
          />
        </Modal.Content>

        <Modal.Footer>
          <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isSaving} />

          <Button
            text={`Add ${Fmt.commas(selectedCount)} Selected`}
            icon="Add"
            onClick={handleAdd}
            disabled={isSaving || store.isLoading || !selectedCount}
            color={colors.custom.green}
          />
        </Modal.Footer>
      </Modal.Container>
    );
  },
);
