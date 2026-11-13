import { useEffect, useState } from "react";
import { FileSchema } from "medior/_generated/server";
import {
  Button,
  Card,
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
import {
  formatCaptionSegments,
  getCaptionTranslation,
  getNameTranslation,
  hasTranscription,
} from "medior/utils/common";
import { rpc } from "medior/utils/server";

/**
 * Translates files' names and transcripts into the target language, showing the server job's
 * progress, then each original beside its translation and which of the names shows on file cards.
 */
export const FileTranslationModal = Comp(() => {
  const stores = useStores();
  const store = stores.file.translation;

  const [files, setFiles] = useState<FileSchema[]>([]);

  const load = useCancellableLoad();

  const language = stores.home.settings.file.translation.language;
  const isBusy = store.isTranslating || store.isSaving || load.isLoading;
  const translatedNames = files
    .map((file) => getNameTranslation(file, language)?.text)
    .filter(Boolean);
  // Only a single file's transcript is shown, and only when the translation covers it.
  const transcriptFile =
    files.length === 1 &&
    hasTranscription(files[0].transcription) &&
    (!store.sources || store.sources.includes("transcript"))
      ? files[0]
      : null;
  const transcriptTranslation = getCaptionTranslation(transcriptFile, "transcript", language);

  useEffect(() => {
    if (!store.isTranslating) loadFiles();
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
      translatedNames.join("\n"),
      translatedNames.length === 1 ? "Copied translation" : "Copied translations",
    );

  const handleMinimize = () => store.setIsMinimized(true);

  const handleRetranslate = async () => {
    const res = await store.translate({ force: true });
    if (!res.success) toast.error(res.error);
  };

  const handleSave = async () => {
    const res = await store.save();
    if (!res.success) toast.error(res.error);
    else toast.success(files.length === 1 ? "Translation saved" : "Translations saved");
  };

  /** The files as the translation stored them, starting from the choice they share, if any. */
  const loadFiles = () =>
    load.run(async (signal) => {
      const fileIds = [...store.fileIds];

      const res = await rpc.listFile({ args: { filter: { id: fileIds } } }, { signal });

      signal.throwIfAborted();

      if (!res.success) throw new Error(res.error);

      const filesById = new Map(res.data.items.map((file) => [file.id, file]));
      const loadedFiles = fileIds.map((id) => filesById.get(id)).filter(Boolean);
      const displays = new Set(
        loadedFiles.map((file) => getNameTranslation(file, language)?.display ?? "translation"),
      );

      setFiles(loadedFiles);
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
        <Text preset="title">{"Translation"}</Text>
      </Modal.Header>

      {/* The progress shown over the modal needs room before the files' names fill it. */}
      <Modal.Content spacing="1rem" minHeight={isBusy ? "16rem" : undefined}>
        <View column spacing="0.5rem">
          {files.map((file) => (
            <UniformList key={file.id} row spacing="1rem">
              <Detail
                label="Original Name"
                value={file.originalName}
                whiteSpace="normal"
                valueProps={{ overflowWrap: "anywhere" }}
                minWidth={0}
              />

              <Detail
                label="Translated Name"
                value={getNameTranslation(file, language)?.text}
                whiteSpace="normal"
                valueProps={{ overflowWrap: "anywhere" }}
                minWidth={0}
              />
            </UniformList>
          ))}
        </View>

        {transcriptFile && (
          <UniformList row spacing="1rem">
            <Detail
              label="Original Transcript"
              minWidth={0}
              value={
                <Card height="15rem" overflow="auto">
                  <Text flexShrink={0} whiteSpace="pre-wrap">
                    {transcriptFile.transcription.segments?.length
                      ? formatCaptionSegments(transcriptFile.transcription.segments)
                      : transcriptFile.transcription.text}
                  </Text>
                </Card>
              }
            />

            <Detail
              label="Translated Transcript"
              minWidth={0}
              value={
                transcriptTranslation && (
                  <Card height="15rem" overflow="auto">
                    <Text flexShrink={0} whiteSpace="pre-wrap">
                      {formatCaptionSegments(transcriptTranslation.segments)}
                    </Text>
                  </Card>
                )
              }
            />
          </UniformList>
        )}

        <View row align="center" spacing="0.5rem">
          <Text preset="detail-label">{"Show on File Cards"}</Text>

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
          disabled={!translatedNames.length}
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
          disabled={!translatedNames.length || store.isTranslating}
          colorOnHover={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
