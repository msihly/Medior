import { useState } from "react";
import {
  Button,
  Card,
  CenteredText,
  IconButton,
  ImportBatch,
  Modal,
  Pagination,
  UniformList,
  View,
} from "medior/components";
import { observer, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

const PAGE_SIZE = 20;

export const ImportManager = observer(() => {
  const stores = useStores();

  const [activeType, setActiveType] = useState<"completed" | "pending">("pending");
  const batches =
    activeType === "completed"
      ? [...stores.import.manager.completedBatches].reverse()
      : stores.import.manager.incompleteBatches;

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(batches?.length / PAGE_SIZE));

  const handleChange = (newPage: number) => setPage(newPage);

  const handleClose = () => {
    stores.import.manager.setIsOpen(false);
    stores.file.search.reloadIfQueued();
  };

  const handleCompletedClick = () => {
    setPage(1);
    setActiveType("completed");
  };

  const handlePendingClick = () => {
    setPage(1);
    setActiveType("pending");
  };

  const handleTagManager = () => stores.tag.manager.setIsOpen(true);

  return (
    <Modal.Container
      visible={stores.import.manager.isOpen}
      onClose={handleClose}
      maxWidth="65rem"
      maxHeight="50rem"
      width="100%"
      height="100%"
    >
      <View row justify="space-between" align="center" padding={{ all: "0.5rem 0.8rem 0.3rem" }}>
        <IconButton
          name="Label"
          iconProps={{ color: colors.custom.grey }}
          onClick={handleTagManager}
        />

        <UniformList row uniformWidth="9rem" width="100%" justify="center" spacing="1rem">
          <Button
            text={`Pending - ${stores.import.manager.incompleteBatches?.length}`}
            onClick={handlePendingClick}
            color={activeType === "pending" ? colors.custom.purple : colors.foreground}
          />

          <Button
            text={`Completed - ${stores.import.manager.completedBatches?.length}`}
            onClick={handleCompletedClick}
            color={activeType === "completed" ? colors.custom.green : colors.foreground}
          />
        </UniformList>

        <DeleteToggleButton type={activeType} />
      </View>

      <Modal.Content dividers={false}>
        <Card height="100%" width="100%">
          <View column height="100%" padding={{ bottom: "5rem" }} overflow="hidden auto">
            {batches?.length ? (
              batches
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((batch) => <ImportBatch key={batch.id} {...{ batch }} />)
            ) : (
              <CenteredText text={`No ${activeType} Imports`} color={colors.custom.lightGrey} />
            )}
          </View>

          <Pagination count={pageCount} page={page} onChange={handleChange} />
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} color={colors.custom.grey} />
      </Modal.Footer>
    </Modal.Container>
  );
});

interface DeleteToggleButtonProps {
  type: "completed" | "pending";
}

const DeleteToggleButton = observer(({ type }: DeleteToggleButtonProps) => {
  const stores = useStores();

  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false);

  const deleteAll = async () => {
    await stores.import.manager.deleteImportBatches({
      ids: (type === "completed"
        ? stores.import.manager.completedBatches
        : stores.import.manager.incompleteBatches
      ).map((batch) => batch.id),
    });

    toast.success(`Deleted all ${type} import batches`);
    setIsConfirmDeleteAllOpen(false);
  };

  return (
    <View row justify="flex-end">
      {!isConfirmDeleteAllOpen ? (
        <IconButton
          name="DeleteOutline"
          onClick={() => setIsConfirmDeleteAllOpen(true)}
          iconProps={{ color: colors.custom.grey, size: "0.9em" }}
        />
      ) : (
        <>
          <IconButton
            name="CloseOutlined"
            onClick={() => setIsConfirmDeleteAllOpen(false)}
            iconProps={{ color: colors.custom.grey, size: "0.9em" }}
            margins={{ right: "0.1rem" }}
          />

          <IconButton
            name="Delete"
            onClick={deleteAll}
            iconProps={{ color: colors.custom.red, size: "0.9em" }}
          />
        </>
      )}
    </View>
  );
});
