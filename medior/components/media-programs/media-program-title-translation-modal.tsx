import { useEffect, useState } from "react";
import { MediaProgramSchema } from "medior/_generated/server";
import {
  Button,
  Comp,
  Detail,
  JobProgress,
  LoadingOverlay,
  Modal,
  Radio,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, copyToClipboard, toast, useCancellableLoad } from "medior/utils/client";
import { getTitleTranslation } from "medior/utils/common";
import { rpc } from "medior/utils/server";

/**
 * Translates episode titles from a program's metadata into the target language, showing the
 * server job's progress, then each title beside its translation and which of them shows on episode
 * cards.
 */
export const MediaProgramTitleTranslationModal = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.titleTranslation;

  const [program, setProgram] = useState<MediaProgramSchema>(null);

  const load = useCancellableLoad();

  const language = stores.home.settings.file.translation.language;
  const isBusy = store.isTranslating || store.isSaving || load.isLoading;
  const translatedTitles = store.titles
    .map((title) => getTitleTranslation(program, title, language)?.text)
    .filter(Boolean);

  useEffect(() => {
    if (!store.isTranslating) loadProgram();
  }, [store.isTranslating]);

  /** A running translation keeps going from the corner, where the modal can be restored. */
  const handleClose = () => {
    if (store.isTranslating) handleMinimize();
    else {
      load.cancel();
      store.close();
    }
  };

  const handleCopy = () =>
    copyToClipboard(
      translatedTitles.join("\n"),
      translatedTitles.length === 1 ? "Copied translation" : "Copied translations",
    );

  const handleMinimize = () => store.setIsMinimized(true);

  const handleRetranslate = async () => {
    const res = await store.translate({ force: true });
    if (!res.success) toast.error(res.error);
  };

  /** Saving closes the modal, which clears its titles. */
  const handleSave = async () => {
    const isSingle = store.titles.length === 1;

    const res = await store.save();
    if (!res.success) toast.error(res.error);
    else toast.success(isSingle ? "Translation saved" : "Translations saved");
  };

  /** The program as the translation stored it, starting from the choice its titles share, if any. */
  const loadProgram = () =>
    load.run(async (signal) => {
      const res = await rpc.listMediaProgram(
        { args: { filter: { id: store.programId } } },
        { signal },
      );

      signal.throwIfAborted();

      if (!res.success) throw new Error(res.error);

      const loadedProgram = res.data.items[0] ?? null;
      const displays = new Set(
        store.titles.map(
          (title) => getTitleTranslation(loadedProgram, title, language)?.display ?? "translation",
        ),
      );

      setProgram(loadedProgram);
      store.setDisplay(displays.size === 1 ? [...displays][0] : "translation");
    });

  return (
    <Modal.Container
      width="100%"
      maxWidth="60rem"
      visible={!store.isMinimized}
      onClose={handleClose}
    >
      <LoadingOverlay
        isLoading={isBusy}
        sub={
          store.job ? (
            <JobProgress job={store.job} onMinimize={handleMinimize} />
          ) : store.isSaving ? (
            <Text>{"Saving…"}</Text>
          ) : load.isLoading ? (
            <Button text="Cancel" icon="Close" onClick={handleClose} />
          ) : null
        }
      />

      <Modal.Header>
        <Text preset="title">{"Title Translation"}</Text>
      </Modal.Header>

      {/* The progress shown over the modal needs room when there are few titles. */}
      <Modal.Content spacing="1rem" minHeight={isBusy ? "16rem" : undefined}>
        <View column spacing="0.5rem">
          {store.titles.map((title) => (
            <UniformList key={title} row spacing="1rem">
              <Detail
                label="Original Title"
                value={title}
                whiteSpace="normal"
                valueProps={{ overflowWrap: "anywhere" }}
                minWidth={0}
              />

              <Detail
                label="Translated Title"
                value={getTitleTranslation(program, title, language)?.text}
                whiteSpace="normal"
                valueProps={{ overflowWrap: "anywhere" }}
                minWidth={0}
              />
            </UniformList>
          ))}
        </View>

        <View row align="center" spacing="0.5rem">
          <Text preset="detail-label">{"Show on Episode Cards"}</Text>

          <Radio
            label="Original"
            checked={store.display === "original"}
            setChecked={() => store.setDisplay("original")}
            flex="none"
            width="auto"
          />

          <Radio
            label="Translation"
            checked={store.display === "translation"}
            setChecked={() => store.setDisplay("translation")}
            flex="none"
            width="auto"
          />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="Copy"
          icon="ContentCopy"
          onClick={handleCopy}
          disabled={!translatedTitles.length}
          colorOnHover={colors.custom.blue}
        />

        <Button
          text="Translate Again"
          icon="Refresh"
          onClick={handleRetranslate}
          disabled={store.isTranslating || store.isSaving}
          colorOnHover={colors.custom.blue}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!translatedTitles.length || store.isTranslating}
          colorOnHover={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
