import { KeyboardEvent, SyntheticEvent, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { Button, Comp, Modal, Settings, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { getHotkey, Hotkeys, RATING_HOTKEY_KEYS } from "medior/utils/common";
import { ConfigKey } from "medior/utils/server";

interface HotkeyField {
  configKey: ConfigKey;
  label: string;
}

interface HotkeyTab {
  fields: HotkeyField[];
  label: string;
}

const getRatingFields = (screen: keyof Hotkeys): HotkeyField[] =>
  RATING_HOTKEY_KEYS.map((key, index) => ({
    configKey: `hotkeys.${screen}.${key}` as ConfigKey,
    label: `Rate ${index + 1}`,
  }));

const HOTKEY_TABS: HotkeyTab[] = [
  {
    fields: [
      { configKey: "hotkeys.carousel.deleteFiles", label: "Delete Files" },
      { configKey: "hotkeys.carousel.detectFaces", label: "Detect Faces" },
      { configKey: "hotkeys.carousel.editTags", label: "Edit Tags" },
      { configKey: "hotkeys.carousel.fileInfo", label: "File Info" },
      { configKey: "hotkeys.carousel.nextFile", label: "Next File" },
      { configKey: "hotkeys.carousel.nextFrame", label: "Next Frame" },
      { configKey: "hotkeys.carousel.playPause", label: "Play / Pause" },
      { configKey: "hotkeys.carousel.previousFile", label: "Previous File" },
      { configKey: "hotkeys.carousel.previousFrame", label: "Previous Frame" },
      ...getRatingFields("carousel"),
      { configKey: "hotkeys.carousel.seekBackward3Seconds", label: "Seek Back 3 Seconds" },
      { configKey: "hotkeys.carousel.seekBackward30Seconds", label: "Seek Back 30 Seconds" },
      { configKey: "hotkeys.carousel.seekForward3Seconds", label: "Seek Forward 3 Seconds" },
      { configKey: "hotkeys.carousel.seekForward30Seconds", label: "Seek Forward 30 Seconds" },
      { configKey: "hotkeys.carousel.volumeDown", label: "Volume Down" },
      { configKey: "hotkeys.carousel.volumeUp", label: "Volume Up" },
    ],
    label: "Carousel",
  },
  {
    fields: [
      { configKey: "hotkeys.collectionEditor.detectFaces", label: "Detect Faces" },
      { configKey: "hotkeys.collectionEditor.editTags", label: "Edit Tags" },
      { configKey: "hotkeys.collectionEditor.fileInfo", label: "File Info" },
      { configKey: "hotkeys.collectionEditor.nextFile", label: "Next File" },
      { configKey: "hotkeys.collectionEditor.previousFile", label: "Previous File" },
      ...getRatingFields("collectionEditor"),
      { configKey: "hotkeys.collectionEditor.removeFiles", label: "Remove Files" },
      { configKey: "hotkeys.collectionEditor.selectAll", label: "Select All in View" },
    ],
    label: "Collection Editor",
  },
  {
    fields: [
      { configKey: "hotkeys.home.deleteFiles", label: "Delete Files" },
      { configKey: "hotkeys.home.detectFaces", label: "Detect Faces" },
      { configKey: "hotkeys.home.editTags", label: "Edit Tags" },
      { configKey: "hotkeys.home.fileInfo", label: "File Info" },
      { configKey: "hotkeys.home.nextFile", label: "Next File" },
      { configKey: "hotkeys.home.previousFile", label: "Previous File" },
      ...getRatingFields("home"),
      { configKey: "hotkeys.home.selectAll", label: "Select All in View" },
    ],
    label: "Home",
  },
  {
    fields: [
      { configKey: "hotkeys.search.deleteFiles", label: "Delete Files" },
      { configKey: "hotkeys.search.detectFaces", label: "Detect Faces" },
      { configKey: "hotkeys.search.editTags", label: "Edit Tags" },
      { configKey: "hotkeys.search.fileInfo", label: "File Info" },
      { configKey: "hotkeys.search.nextFile", label: "Next File" },
      { configKey: "hotkeys.search.previousFile", label: "Previous File" },
      ...getRatingFields("search"),
      { configKey: "hotkeys.search.selectAll", label: "Select All in View" },
    ],
    label: "Search",
  },
  {
    fields: [
      ...getRatingFields("tagManager"),
      { configKey: "hotkeys.tagManager.selectAll", label: "Select All in View" },
    ],
    label: "Tag Manager",
  },
];

export interface HotkeysModalProps {
  onClose: () => void;
}

export const HotkeysModal = Comp(({ onClose }: HotkeysModalProps) => {
  const stores = useStores();
  const store = stores.home.settings;
  const { css } = useClasses(null);
  const [activeTab, setActiveTab] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialHasUnsavedChanges] = useState(store.hasUnsavedChanges);
  const [initialHotkeys] = useState(() => store.getConfig().hotkeys);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = () => {
    if (hasChanges) {
      store.update({ hotkeys: initialHotkeys });
      store.setHasUnsavedChanges(initialHasUnsavedChanges);
    }
    onClose();
  };

  const handleHotkeyChange = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Tab") return;

    const hotkey = getHotkey(event);
    if (hotkey === null) return;

    event.preventDefault();
    store.update({ [(event.target as HTMLInputElement).name]: hotkey });
    setHasChanges(true);
  };

  const handleModalKeyDown = (event: KeyboardEvent) => event.stopPropagation();

  const handleSave = async () => {
    try {
      setIsLoading(true);
      const res = await store.save();
      if (!res.success) throw new Error(res.error);
      store.setHasUnsavedChanges(false);
      toast.success("Hotkeys saved!");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save hotkeys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (_: SyntheticEvent, value: number) => setActiveTab(value);

  return (
    <Modal.Container
      isLoading={isLoading}
      onClose={handleCancel}
      onKeyDown={handleModalKeyDown}
      height="90%"
      width="60rem"
    >
      <Modal.Header>
        <Text preset="title">{"Hotkeys"}</Text>
      </Modal.Header>

      <Modal.Content spacing="1rem" overflow="hidden">
        <Text color={colors.custom.lightGrey}>
          {"Press a shortcut to assign it. Press Backspace to clear it."}
        </Text>

        <Tabs
          className={css.tabs}
          onChange={handleTabChange}
          value={activeTab}
          variant="scrollable"
        >
          {HOTKEY_TABS.map(({ label }) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>

        <View className={css.fields} overflow="auto">
          {HOTKEY_TABS[activeTab].fields.map(({ configKey, label }) => (
            <Settings.Input
              key={configKey}
              configKey={configKey}
              header={label}
              inputProps={{ name: configKey, readOnly: true }}
              onKeyDown={handleHotkeyChange}
              textAlign="center"
            />
          ))}
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!hasChanges}
          color={hasChanges ? colors.custom.blue : undefined}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  fields: {
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    padding: "0.2rem",
  },
  tabs: {
    flexShrink: 0,
    minHeight: 36,
    "& .MuiTab-root": {
      minHeight: 36,
      textTransform: "none",
    },
  },
});
