import { useState } from "react";
import {
  Button,
  Comp,
  LoadingOverlay,
  Modal,
  NumInput,
  RepairCheckbox,
  Text,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { durationToSeconds, secondsToDuration } from "medior/utils/common";
import { ConfigKey, getConfig, ReencodeCandidateType } from "medior/utils/server";

const QUEUE_MAX_DURATION_KEY = "file.reencode.queueMaxDuration" as ConfigKey;
const QUEUE_TYPES_KEY = "file.reencode.queueTypes" as ConfigKey;

export const ReencodeCandidates = Comp(() => {
  const stores = useStores();
  const settings = stores.home.settings;
  const store = stores.file.videoTransformer;

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [maxDurationDisplay, setMaxDurationDisplay] = useState("");
  const [types, setTypes] = useState<ReencodeCandidateType[]>([]);

  const config = getConfig().file.reencode;
  const maxDuration = maxDurationDisplay ? durationToSeconds(maxDurationDisplay) : null;
  const isMaxDurationInvalid = types.includes("video") && maxDuration === 0;

  const handleClose = () => {
    if (!isSaving) setIsOpen(false);
  };

  const handleOpen = () => {
    setMaxDurationDisplay(
      config.queueMaxDuration ? secondsToDuration(config.queueMaxDuration) : "",
    );
    setTypes([...config.queueTypes]);
    setIsOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      settings.update({ [QUEUE_MAX_DURATION_KEY]: maxDuration, [QUEUE_TYPES_KEY]: types });

      const saved = await settings.save();
      if (!saved.success) return toast.error(saved.error);

      if (!types.length) toast.success("Stopped adding re-encodes");
      else {
        const res = await store.queueReencodeCandidates(types);
        if (!res.success) return toast.error(res.error);

        toast.success(`Added ${res.data.toLocaleString()} files to the re-encode queue`);
      }

      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const setTypeChecked = (type: ReencodeCandidateType, checked: boolean) =>
    setTypes((previous) =>
      checked ? [...previous, type] : previous.filter((cur) => cur !== type),
    );

  return (
    <>
      <Button
        text="Add Re-encodes"
        icon="PlaylistAdd"
        onClick={handleOpen}
        disabled={store.isUpdating}
      />

      {isOpen && (
        <Modal.Container onClose={handleClose} width="30rem">
          <LoadingOverlay isLoading={isSaving} />

          <Modal.Header>
            <Text preset="title">{"Add Re-encodes"}</Text>
          </Modal.Header>

          <Modal.Content dividers={false} spacing="0.5rem">
            <RepairCheckbox
              label="Images"
              description={`Long edge over ${config.imageMaxLongEdge.toLocaleString()}px or short edge over ${config.imageMaxShortEdge.toLocaleString()}px.`}
              checked={types.includes("image")}
              setChecked={(checked) => setTypeChecked("image", checked)}
              disabled={isSaving}
            />

            <RepairCheckbox
              label="GIFs"
              description={`Over ${config.maxBitrate.toLocaleString()} kbps${config.maxFps ? `, ${config.maxFps} FPS` : ""}, or ${config.maxLongEdge.toLocaleString()} × ${config.maxShortEdge.toLocaleString()}px.`}
              checked={types.includes("gif")}
              setChecked={(checked) => setTypeChecked("gif", checked)}
              disabled={isSaving}
            />

            <View row align="center" spacing="0.5rem">
              <RepairCheckbox
                label="Videos"
                description="Same limits as GIFs, up to the max length."
                checked={types.includes("video")}
                setChecked={(checked) => setTypeChecked("video", checked)}
                disabled={isSaving}
              />

              <NumInput
                header="Max Length"
                adornment="hms"
                value={maxDuration}
                valueDisplay={maxDurationDisplay}
                setValueDisplay={setMaxDurationDisplay}
                disabled={isSaving || !types.includes("video")}
                minValue={1}
                width="8rem"
                dense
              />
            </View>

            <Text color={colors.custom.lightGrey} fontSize="0.8em" whiteSpace="normal">
              {
                "Skips corrupted, previously re-encoded, and excluded-tag files. Largest images and highest-bitrate GIFs and videos go first, 1,000 images or 100 GIFs and videos at a time. Checked types are saved and refill the queue whenever it runs out."
              }
            </Text>
          </Modal.Content>

          <Modal.Footer uniformWidth="8rem">
            <Button
              text="Close"
              icon="Close"
              onClick={handleClose}
              disabled={isSaving}
              color={colors.foregroundCard}
            />

            <Button
              text={types.length ? "Add to Queue" : "Save"}
              icon={types.length ? "PlaylistAdd" : "Save"}
              onClick={handleSave}
              disabled={isSaving || isMaxDurationInvalid || store.isUpdating}
              color={colors.custom.blue}
            />
          </Modal.Footer>
        </Modal.Container>
      )}
    </>
  );
});
