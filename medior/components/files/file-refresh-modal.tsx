import { Button, Comp, Icon, JobProgress, Modal, Text } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const FileRefreshModal = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  const job = store.refreshJob;

  const handleCancel = async () => {
    if (!job) store.setIsRefreshOpen(false);
    else {
      const res = await stores.home.stopJob(job.id);
      if (!res.success) toast.error(res.error);
    }
  };

  const handleMinimize = () => store.setIsRefreshMinimized(true);

  return (
    <Modal.Container
      height="30rem"
      width="35rem"
      visible={!store.isRefreshMinimized}
      onClose={handleMinimize}
    >
      <Modal.Header>
        <Text preset="title">{"Refresh Files"}</Text>
      </Modal.Header>

      <Modal.Content align="center" justify="center" spacing="1rem">
        <Icon name="Refresh" color={colors.custom.lightBlue} size="5rem" />

        {job && <JobProgress job={job} embedded />}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={job?.isStopping ? "Stopping…" : "Cancel"}
          icon="Close"
          onClick={handleCancel}
          disabled={job?.isStopping}
        />

        <Button text="Minimize" icon="IndeterminateCheckBox" onClick={handleMinimize} />
      </Modal.Footer>
    </Modal.Container>
  );
});
