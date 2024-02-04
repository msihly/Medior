import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { ImportRegExMapper, TagEditor, TagManager, TagMerger, Tagger } from "components";

interface TagModalsProps {
  view: "carousel" | "home" | "search";
}

export const TagModals = observer(({ view }: TagModalsProps) => {
  const { carouselStore, importStore, tagStore } = useStores();

  const setTaggerVisible = (val: boolean) => tagStore.setIsTaggerOpen(val);

  return (
    <>
      {tagStore.isTaggerOpen && (
        <Tagger
          fileIds={view === "carousel" ? [carouselStore.activeFileId] : tagStore.taggerFileIds}
          setVisible={setTaggerVisible}
        />
      )}

      {importStore.isImportRegExMapperOpen && <ImportRegExMapper />}

      {tagStore.isTagEditorOpen && <TagEditor id={tagStore.activeTagId} hasSubEditor />}

      {tagStore.isTagSubEditorOpen && <TagEditor id={tagStore.subEditorTagId} isSubEditor />}

      {tagStore.isTagManagerOpen && <TagManager />}

      {tagStore.isTagMergerOpen && <TagMerger />}
    </>
  );
});
