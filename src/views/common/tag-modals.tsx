import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { FileTagEditor, TagEditor, TagManager, TagMerger } from "components";

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

      {stores.tag.isTagEditorOpen && <TagEditor id={stores.tag.activeTagId} hasSubEditor />}

      {stores.tag.isTagSubEditorOpen && <TagEditor id={stores.tag.subEditorTagId} isSubEditor />}

      {stores.tag.isTagMergerOpen && <TagMerger />}

      {stores.tagManager.isOpen && <TagManager />}
    </>
  );
});
