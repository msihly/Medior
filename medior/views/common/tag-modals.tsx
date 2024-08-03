import { observer, useStores } from "medior/store";
import { FileTagEditor, MultiTagEditor, TagEditor, TagManager, TagMerger } from "medior/components";

interface TagModalsProps {
  view: "carousel" | "home" | "search";
}

export const TagModals = observer(({ view }: TagModalsProps) => {
  const stores = useStores();

  return (
    <>
      {stores.tag.isFileTagEditorOpen && (
        <FileTagEditor
          fileIds={
            view === "carousel" ? [stores.carousel.activeFileId] : stores.tag.fileTagEditorFileIds
          }
        />
      )}

      {stores.tagManager.isMultiTagEditorOpen && <MultiTagEditor />}

      {stores.tag.isTagEditorOpen && <TagEditor id={stores.tag.activeTagId} hasSubEditor />}

      {stores.tag.isTagSubEditorOpen && <TagEditor id={stores.tag.subEditorTagId} isSubEditor />}

      {stores.tag.isTagMergerOpen && <TagMerger />}

      {stores.tagManager.isOpen && <TagManager />}
    </>
  );
});
