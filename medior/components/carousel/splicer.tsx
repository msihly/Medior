import { useRef, useState } from "react";
import type { SpliceMode } from "medior/server/database";
import {
  Button,
  Card,
  Comp,
  ConfirmModal,
  Divider,
  Dropdown,
  Input,
  TimestampRow,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { parseTimestampPairs, sleep } from "medior/utils/common";

const SPLICE_MODE_OPTIONS: Array<{ label: string; value: SpliceMode }> = [
  { label: "Replace Original", value: "replace" },
  { label: "New Copy", value: "copy" },
];

export const Splicer = Comp(() => {
  const stores = useStores();
  const store = stores.carousel.splicer;

  const file = stores.carousel.getActiveFile();

  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isConfirmRenderOpen, setIsConfirmRenderOpen] = useState(false);

  const timestampsRef = useRef<HTMLDivElement>(null);

  const handleAddPair = async () => {
    store.addTimestampPair();
    await sleep(500);
    timestampsRef.current?.scrollTo({
      behavior: "smooth",
      top: timestampsRef.current.scrollHeight,
    });
  };

  const handleConfirmDelete = async () => {
    const res = await store.deleteTimeline();

    if (!res.success) toast.error(res.error);
    else toast.warn("Deleted");

    return res.success;
  };

  const handleDeleteTimeline = () => setIsConfirmDeleteOpen(true);

  const handleRender = async () => {
    const res = await stores.file.videoTransformer.getTransformerStatus();

    if (!res.success) toast.error(res.error);
    else if (res.data?.isTransforming) setIsConfirmRenderOpen(true);
    else startRender();
  };

  const handleSave = async () => {
    const res = await store.saveTimestamps();
    if (!res.success) toast.error(res.error);
  };

  const startRender = async () => {
    try {
      stores.file.videoTransformer.setTimestampPairs(
        parseTimestampPairs(
          file.timestamps.find((timeline) => timeline.id === store.timestampId).pairs,
          file.duration,
        ),
      );

      stores.file.videoTransformer.setSpliceMode(store.spliceMode);
      stores.file.openVideoTransformer([file.id], "splice");

      return true;
    } catch (error) {
      toast.error(error);

      return false;
    }
  };

  return (
    <View
      column
      height="100%"
      padding={{ all: stores.carousel.isPinned ? "0.5rem" : "3rem 0.5rem 3.5rem 0.5rem" }}
      bgColor="rgb(0 0 0 / 0.5)"
      maxWidth="21rem"
      minWidth="21rem"
    >
      <Card spacing="1rem" height="100%" width="100%" bgColor={colors.background}>
        <View column>
          <Dropdown
            header="Timelines"
            options={file.timestamps?.map((t) => ({ label: t.label, value: t.id })) ?? []}
            value={store.timestampId}
            setValue={store.setTimestampId}
            disabled={!file.timestamps?.length || store.isLoading}
            borders={{ right: "none" }}
            borderRadiuses={{ bottom: 0 }}
          />

          <Input
            header="Label"
            value={store.timestampLabel}
            setValue={store.setTimestampLabel}
            disabled={store.isLoading}
            headerProps={{ borderRadiuses: { top: 0 } }}
          />
        </View>

        <Divider />

        <View
          ref={timestampsRef}
          column
          flex="1 1 0"
          height="100%"
          spacing="0.5rem"
          overflow="auto"
        >
          {store.timestampPairs.map((t) => (
            <TimestampRow key={t.id} timestamp={t} />
          ))}

          <View height="2rem" />
        </View>

        <Divider />

        <View column spacing="0.5rem">
          <Dropdown
            header="Render As"
            options={SPLICE_MODE_OPTIONS}
            value={store.spliceMode}
            setValue={store.setSpliceMode}
            disabled={store.isLoading}
          />

          <UniformList row spacing="0.5rem">
            <Button
              text="Add"
              icon="Add"
              onClick={handleAddPair}
              color={colors.custom.blue}
              disabled={store.isLoading}
            />

            <Button
              text="Delete"
              icon="Delete"
              onClick={handleDeleteTimeline}
              color={colors.custom.red}
              disabled={!store.timestampId || store.isLoading}
            />
          </UniformList>

          <UniformList row spacing="0.5rem">
            <Button
              text="Save"
              icon="Check"
              onClick={handleSave}
              disabled={!store.hasChanges || store.isLoading}
              color={colors.custom.green}
            />

            <Button
              text="Render"
              icon="RocketLaunch"
              onClick={handleRender}
              color={colors.custom.purple}
              disabled={!store.timestampId || store.hasChanges || store.isLoading}
            />
          </UniformList>
        </View>
      </Card>

      {isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Timeline"
          subText={store.timestampLabel}
          onConfirm={handleConfirmDelete}
          setVisible={setIsConfirmDeleteOpen}
        />
      )}

      {isConfirmRenderOpen && (
        <ConfirmModal
          headerText="Pause Media Transformer"
          subText="The media transformer is running. Rendering pauses it and loses the active transform's progress."
          confirmText="Render"
          confirmIcon="RocketLaunch"
          confirmColor={colors.custom.purple}
          onConfirm={startRender}
          setVisible={setIsConfirmRenderOpen}
        />
      )}
    </View>
  );
});
