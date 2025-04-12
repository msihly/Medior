import { Comp, FileTagEditor, MultiTagEditor, TagEditor, TagManager, TagMerger } from "medior/components";
import { useStores } from "medior/store";

interface TagModalsProps {
  view: "carousel" | "home" | "search";
}

export const TagModals = Comp(({ view }: TagModalsProps) => {
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

      {stores.tag.manager.isMultiTagEditorOpen && <MultiTagEditor />}

      {stores.tag.isTagEditorOpen && <TagEditor id={stores.tag.activeTagId} hasSubEditor />}

      {stores.tag.isTagSubEditorOpen && <TagEditor id={stores.tag.subEditorTagId} isSubEditor />}

      {stores.tag.isTagMergerOpen && <TagMerger />}

      {stores.tag.manager.isOpen && <TagManager />}
    </>
  );
});
