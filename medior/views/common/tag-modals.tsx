import {
  Comp,
  FileTagEditor,
  MultiTagEditor,
  TagEditor,
  TagManager,
  TagMerger,
} from "medior/components";
import { useStores } from "medior/store";

interface TagModalsProps {
  view: "carousel" | "home" | "search";
}

export const TagModals = Comp(({ view }: TagModalsProps) => {
  const stores = useStores();
  const store = stores.tag;

  return (
    <>
      {stores.file.tagsEditor.isOpen && (
        <FileTagEditor
          fileIds={
            view === "carousel" ? [stores.carousel.activeFileId] : stores.file.tagsEditor.fileIds
          }
        />
      )}

      {store.manager.isMultiTagEditorOpen && <MultiTagEditor />}

      {store.editor.isOpen && <TagEditor />}

      {store.subEditor.isOpen && <TagEditor isSubEditor />}

      {store.merger.isOpen && <TagMerger />}

      {store.manager.isOpen && <TagManager />}
    </>
  );
});
