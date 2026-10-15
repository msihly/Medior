import { useState } from "react";
import { Button, Card, Comp, LoadingOverlay, Settings, UniformList, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { ConfigKey } from "medior/utils/server";
import { ConfigTags } from "./config-tags";

export const TransformConfig = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const [isSaving, setIsSaving] = useState(false);

  const overrideKey = "file.reencode.override" as ConfigKey;

  const handleOverrideChange = (value: string) =>
    stores.home.settings.update({
      [overrideKey]: value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });

  const handleSaveConfig = async () => {
    setIsSaving(true);

    try {
      const result = await stores.home.settings.save();

      if (!result.success) toast.error(result.error);
      else toast.success("Transform config saved");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleConfig = () => store.setIsConfigOpen(!store.isConfigOpen);

  return (
    <Card
      spacing="0.5rem"
      height="fit-content"
      overflow="hidden auto"
      bgColor={colors.foregroundCard}
      header={
        <View row justify="space-between" align="center" width="100%">
          <Button
            text="Save"
            icon="Save"
            onClick={handleSaveConfig}
            disabled={!stores.home.settings.hasUnsavedChanges}
            color={stores.home.settings.hasUnsavedChanges ? colors.custom.blue : undefined}
          />

          <Button
            text={store.isConfigOpen ? "Hide Config" : "Config"}
            icon="Settings"
            onClick={handleToggleConfig}
            color={store.isConfigOpen ? colors.custom.blue : undefined}
          />
        </View>
      }
      headerProps={{ justify: "flex-start", padding: { all: "0.4rem 0.6rem" } }}
    >
      <LoadingOverlay isLoading={isSaving} />

      <View column spacing="0.5rem" width="100%">
        <Card header="Video" row spacing="0.5rem">
          <Settings.Input header="Codec" configKey="file.reencode.codec" width="8rem" dense />

          <Settings.NumInput
            header="Max Bitrate"
            configKey="file.reencode.maxBitrate"
            minValue={1}
            dense
          />

          <Settings.NumInput header="Max FPS" configKey="file.reencode.maxFps" minValue={1} dense />

          <Settings.NumInput
            header="Max Long Edge"
            configKey="file.reencode.maxLongEdge"
            minValue={1}
            dense
          />

          <Settings.NumInput
            header="Max Short Edge"
            configKey="file.reencode.maxShortEdge"
            minValue={1}
            dense
          />

          <Settings.NumInput
            header="Concurrent Videos"
            configKey="file.reencode.videoConcurrency"
            minValue={1}
            maxValue={16}
            dense
          />

          <Settings.Input
            header="Override Args"
            configKey={overrideKey}
            value={stores.home.settings.getConfigByKey<string[]>(overrideKey)?.join(", ") ?? ""}
            setValue={handleOverrideChange}
            flex={1}
            width="auto"
            dense
          />
        </Card>

        <Card header="Image" row spacing="0.5rem">
          <Settings.Dropdown
            header="Output Format"
            configKey="file.reencode.imageExt"
            options={["avif", "gif", "jpeg", "jpg", "png", "tiff", "webp"].map((value) => ({
              label: value.toUpperCase(),
              value,
            }))}
            width="8rem"
            dense
          />

          <Settings.NumInput
            header="JPG Quality"
            configKey="file.reencode.imageJpgQuality"
            disabled={
              !["jpeg", "jpg"].includes(
                stores.home.settings.getConfigByKey<string>("file.reencode.imageExt"),
              )
            }
            minValue={1}
            maxValue={100}
            dense
          />

          <Settings.NumInput
            header="Max Long Edge"
            configKey="file.reencode.imageMaxLongEdge"
            minValue={1}
            dense
          />

          <Settings.NumInput
            header="Max Short Edge"
            configKey="file.reencode.imageMaxShortEdge"
            minValue={1}
            dense
          />

          <Settings.NumInput
            header="Concurrent Images"
            configKey="file.reencode.imageConcurrency"
            minValue={1}
            maxValue={16}
            dense
          />
        </Card>

        <Card header="Tags" spacing="0.5rem">
          <View row spacing="1rem">
            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags
                label="Add Re-encodes - Exclude (Descendants)"
                configKey="file.reencode.excludedDescTagIds"
              />
            </UniformList>

            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags label="Complete - Add" configKey="file.reencode.onComplete.addTagIds" />

              <ConfigTags
                label="Complete - Remove"
                configKey="file.reencode.onComplete.removeTagIds"
              />
            </UniformList>

            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags label="Duplicate - Add" configKey="file.reencode.onDuplicate.addTagIds" />

              <ConfigTags
                label="Duplicate - Remove"
                configKey="file.reencode.onDuplicate.removeTagIds"
              />
            </UniformList>
          </View>

          <View row spacing="1rem">
            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags label="Error - Add" configKey="file.reencode.onError.addTagIds" />

              <ConfigTags label="Error - Remove" configKey="file.reencode.onError.removeTagIds" />
            </UniformList>

            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags label="Skip - Add" configKey="file.reencode.onSkip.addTagIds" />

              <ConfigTags label="Skip - Remove" configKey="file.reencode.onSkip.removeTagIds" />
            </UniformList>

            <UniformList row flex={1} spacing="0.5rem" height="5.5rem">
              <ConfigTags label="Splice - Add" configKey="file.splice.onComplete.addTagIds" />

              <ConfigTags label="Splice - Remove" configKey="file.splice.onComplete.removeTagIds" />
            </UniformList>
          </View>
        </Card>
      </View>
    </Card>
  );
});
