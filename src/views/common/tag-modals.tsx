import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { TagEditor, TagManager, TagMerger, Tagger } from "components";

interface TagModalsProps {
  view: "carousel" | "home" | "search";
}

export const TagModals = observer(({ view }: TagModalsProps) => {
  const stores = useStores();

  const setTaggerVisible = (val: boolean) => stores.tag.setIsTaggerOpen(val);

  return (
    <>
      {stores.tag.isTaggerOpen && (
        <Tagger
          fileIds={view === "carousel" ? [stores.carousel.activeFileId] : stores.tag.taggerFileIds}
          setVisible={setTaggerVisible}
        />
      )}

      {stores.tag.isTagEditorOpen && <TagEditor id={stores.tag.activeTagId} hasSubEditor />}

      {stores.tag.isTagSubEditorOpen && <TagEditor id={stores.tag.subEditorTagId} isSubEditor />}

      {stores.tag.isTagMergerOpen && <TagMerger />}

      {stores.tagManager.isOpen && <TagManager />}
    </>
  );
});
