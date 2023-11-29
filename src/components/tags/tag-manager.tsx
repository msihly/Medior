import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { TagEditor, TagSearch } from ".";
import { Modal } from "components";

const TITLES = {
  create: "Create Tag",
  edit: "Edit Tag",
  search: "Manage Tags",
};

export const TagManager = observer(() => {
  const { tagStore } = useStores();

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleEditorBack = () => tagStore.setTagManagerMode(tagStore.tagManagerPrevMode);

  return (
    <Modal.Container onClose={closeModal} maxHeight="90vh" maxWidth="30rem" width="100%">
      <Modal.Header>{TITLES[tagStore.tagManagerMode]}</Modal.Header>

      {tagStore.tagManagerMode === "search" ? (
        <TagSearch />
      ) : (
        <TagEditor create={tagStore.tagManagerMode === "create"} goBack={handleEditorBack} />
      )}
    </Modal.Container>
  );
});
