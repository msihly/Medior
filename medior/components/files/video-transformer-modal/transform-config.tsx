import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { Button, Card, Comp, TagInput, UniformList, View } from "medior/components";
import { Settings } from "medior/components/settings";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { ConfigKey, loadConfig, saveConfig } from "medior/utils/server";

export const TransformConfig = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const overrideKey = "file.reencode.override" as ConfigKey;

  const handleSaveConfig = async () => {
    await saveConfig(await ipcRenderer.invoke("getConfigPath"), stores.home.settings.getConfig());
    await loadConfig(await ipcRenderer.invoke("getConfigPath"));
    stores.home.settings.setHasUnsavedChanges(false);
    toast.success("Transform config saved");
  };

  return (
    <Card
      column
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
            onClick={() => store.setIsConfigOpen(!store.isConfigOpen)}
            color={store.isConfigOpen ? colors.custom.blue : undefined}
          />
        </View>
      }
      headerProps={{ justify: "flex-start", padding: { all: "0.4rem 0.6rem" } }}
    >
      <View row spacing="0.5rem" align="flex-end">
        <Settings.Input header="Codec" configKey="file.reencode.codec" width="8rem" />

        <Settings.NumInput
          header="Max Bitrate"
          configKey="file.reencode.maxBitrate"
          minValue={1}
          width="8rem"
        />

        <Settings.NumInput
          header="Max FPS"
          configKey="file.reencode.maxFps"
          minValue={1}
          width="8rem"
        />

        <Settings.NumInput
          header="Max Height"
          configKey="file.reencode.maxHeight"
          minValue={1}
          width="8rem"
        />

        <Settings.NumInput
          header="Max Width"
          configKey="file.reencode.maxWidth"
          minValue={1}
          width="8rem"
        />
      </View>

      <View row spacing="0.5rem" align="flex-end">
        <Settings.Input header="Image Ext" configKey="file.reencode.imageExt" width="8rem" />

        <Settings.NumInput
          header="Image Max Height"
          configKey="file.reencode.imageMaxHeight"
          minValue={1}
          width="8rem"
        />

        <Settings.NumInput
          header="Image Max Width"
          configKey="file.reencode.imageMaxWidth"
          minValue={1}
          width="8rem"
        />
      </View>

      <Settings.Input
        header="Override Args"
        configKey={overrideKey}
        value={stores.home.settings.getConfigByKey<string[]>(overrideKey)?.join(", ") ?? ""}
        setValue={(value) =>
          stores.home.settings.update({
            [overrideKey]: value
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          })
        }
      />

      <UniformList row spacing="0.5rem" height="8rem">
        <ConfigTags label="Complete - Add" configKey="file.reencode.onComplete.addTagIds" />

        <ConfigTags label="Complete - Remove" configKey="file.reencode.onComplete.removeTagIds" />

        <ConfigTags label="Duplicate - Add" configKey="file.reencode.onDuplicate.addTagIds" />

        <ConfigTags label="Duplicate - Remove" configKey="file.reencode.onDuplicate.removeTagIds" />
      </UniformList>

      <UniformList row spacing="0.5rem" height="8rem">
        <ConfigTags label="Error - Add" configKey="file.reencode.onError.addTagIds" />

        <ConfigTags label="Error - Remove" configKey="file.reencode.onError.removeTagIds" />

        <ConfigTags label="Skip - Add" configKey="file.reencode.onSkip.addTagIds" />

        <ConfigTags label="Skip - Remove" configKey="file.reencode.onSkip.removeTagIds" />
      </UniformList>

      <UniformList row spacing="0.5rem" height="8rem">
        <ConfigTags label="Splice - Add" configKey="file.splice.onComplete.addTagIds" />

        <ConfigTags label="Splice - Remove" configKey="file.splice.onComplete.removeTagIds" />

        <View />

        <View />
      </UniformList>
    </Card>
  );
});

const ConfigTags = Comp(({ configKey, label }: { configKey: string; label: string }) => {
  const stores = useStores();

  const settings = stores.home.settings;

  const ids = settings.getConfigByKey<string[]>(configKey as any) ?? [];

  const [value, setValue] = useState<TagOption[]>([]);

  useEffect(() => {
    (async () => {
      if (!ids.length) return setValue([]);
      const tags = await stores.tag.listByIds({ ids });
      if (!tags.success) throw new Error(tags.error);
      setValue(tags.data.map(tagToOption));
    })();
  }, [ids.join("|")]);

  const handleChange = (tags: TagOption[]) => {
    setValue(tags);
    settings.update({ [configKey]: tags.map((tag) => tag.id) });
  };

  return <TagInput header={label} value={value} onChange={handleChange} width="100%" hasCreate />;
});
