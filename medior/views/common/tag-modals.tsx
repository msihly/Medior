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

  return (
    <>
      {stores.file.tagsEditor.isOpen && (
        <FileTagEditor
          fileIds={
            view === "carousel" ? [stores.carousel.activeFileId] : stores.file.tagsEditor.fileIds
          }
        />
      )}

      {stores.tag.manager.isMultiTagEditorOpen && <MultiTagEditor />}

      {stores.tag.editor.isOpen && <TagEditor />}

      {stores.tag.subEditor.isOpen && <TagEditor isSubEditor />}

      {stores.tag.merger.isOpen && <TagMerger />}

      {stores.tag.manager.isOpen && <TagManager />}
    </>
  );
});
