import { useRef } from "react";
import { colors, toast } from "trabecula/utils/client";
import { durationToSeconds, sleep } from "trabecula/utils/common";
import {
  Button,
  Card,
  Comp,
  Divider,
  Dropdown,
  Input,
  TimestampRow,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";

export const Splicer = Comp(() => {
  const stores = useStores();
  const store = stores.carousel.splicer;

  const file = stores.carousel.getActiveFile();

  const timestampsRef = useRef<HTMLDivElement>(null);

  const handleAddPair = async () => {
    store.addTimestampPair();
    await sleep(500);
    timestampsRef.current.scrollTo({ top: timestampsRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleDeleteTimeline = async () => {
    const res = await store.deleteTimeline();
    if (!res.success) toast.error(res.error);
    else toast.warn("Deleted");
  };

  const handleRender = () => {
    const pairs = [...file.timestamps.find((t) => t.id === store.timestampId).pairs].sort(
      (a, b) => a.order - b.order,
    );

    stores.file.videoTransformer.setTimestampPairs(
      pairs.map((pair) => [
        durationToSeconds(pair.startDuration),
        durationToSeconds(pair.endDuration),
      ]),
    );

    stores.file.openVideoTransformer([file.id], "splice");
  };

  const handleSave = async () => {
    const res = await store.saveTimestamps();
    if (!res.success) toast.error(res.error);
    else toast.success("Saved");

    store.setTimestampId(res.data);
    await store.loadTimestamps();
  };

  return (
    <View
      column
      height="100%"
      padding={{ all: stores.carousel.isPinned ? "0.5rem" : "3rem 0.5rem 3.5rem 0.5rem" }}
      bgColor="rgb(0 0 0 / 0.5)"
      style={{ minWidth: "21rem", maxWidth: "21rem" }}
    >
      <Card column spacing="1rem" height="100%" width="100%" bgColor={colors.background}>
        <View column>
          <Dropdown
            header="Timelines"
            options={file.timestamps?.map((t) => ({ label: t.label, value: t.id })) ?? []}
            value={store.timestampId}
            setValue={store.setTimestampId}
            disabled={!file.timestamps?.length}
            borders={{ right: "none" }}
            borderRadiuses={{ bottom: 0 }}
          />

          <Input
            header="Label"
            value={store.timestampLabel}
            setValue={store.setTimestampLabel}
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
          <UniformList row spacing="0.5rem">
            <Button text="Add" icon="Add" onClick={handleAddPair} color={colors.custom.blue} />

            <Button
              text="Delete"
              icon="Delete"
              onClick={handleDeleteTimeline}
              color={colors.custom.red}
              disabled={!store.timestampId}
            />
          </UniformList>

          <UniformList row spacing="0.5rem">
            <Button
              text="Save"
              icon="Check"
              onClick={handleSave}
              disabled={!store.hasChanges}
              color={colors.custom.green}
            />

            <Button
              text="Render"
              icon="RocketLaunch"
              onClick={handleRender}
              color={colors.custom.purple}
              disabled={!store.timestampId || store.hasChanges}
            />
          </UniformList>
        </View>
      </Card>
    </View>
  );
});
