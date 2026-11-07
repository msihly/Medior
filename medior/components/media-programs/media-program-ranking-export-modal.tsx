import { dialog } from "@electron/remote";
import path from "path";
import { useEffect, useState } from "react";
import { FileSchema, MediaProgramSchema } from "medior/_generated/server";
import {
  Button,
  Card,
  CenteredText,
  Checkbox,
  Comp,
  Dropdown,
  getRatingMeta,
  Input,
  LoadingOverlay,
  Modal,
  NumInput,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, derefMobx, toast, useCancellableLoad } from "medior/utils/client";
import {
  Fmt,
  getMediaProgramDetails,
  getMediaProgramRankingLimitError,
  MEDIA_PROGRAM_RANKING_ASPECT_RATIOS,
  MEDIA_PROGRAM_RANKING_LIMITS,
  MediaProgramRankingExport,
  MediaProgramRankingTile,
} from "medior/utils/common";
import { ConfigKey, getIsAnimated, getIsImage } from "medior/utils/server";

const EXPORT_CONFIG_KEY = "mediaPrograms.rankings.export" as ConfigKey;

const PREVIEW_DELAY = 300;

const TOGGLES: Array<{
  key: "showDetails" | "showName" | "showRank" | "showRating" | "showTitle";
  label: string;
}> = [
  { key: "showTitle", label: "Title" },
  { key: "showRank", label: "Rank" },
  { key: "showName", label: "Name" },
  { key: "showDetails", label: "Details" },
  { key: "showRating", label: "Rating" },
];

export const MediaProgramRankingExportModal = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.rankings;
  const settings = stores.home.settings;

  const programsLoad = useCancellableLoad();
  const previewLoad = useCancellableLoad();

  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState<{
    count: number;
    files: FileSchema[];
    programs: MediaProgramSchema[];
  }>();
  const [options, setOptions] = useState<MediaProgramRankingExport>(() =>
    derefMobx(settings.mediaPrograms.rankings.export),
  );
  const [preview, setPreview] = useState<{ dataUrl: string; failedCount: number }>(null);
  const [title, setTitle] = useState(store.savedSearch?.label ?? "Rankings");

  const limitError = getMediaProgramRankingLimitError(options);
  const count = limitError ? 0 : options.columns * options.rows;

  useEffect(() => {
    if (count > 0)
      programsLoad.run(async (signal) => {
        const res = await store.loadExportPrograms(count);
        if (signal.aborted) return;
        if (!res.success) throw new Error(res.error);

        setItems({ ...res.data, count });
      });
  }, [count]);

  // Previews wait for the programs loaded for the current grid size.
  useEffect(() => {
    const timeout =
      count > 0 && items?.count === count
        ? setTimeout(
            () =>
              previewLoad.run(async (signal) => {
                const res = await store.renderExport({ options, tiles: makeTiles(), title });
                if (signal.aborted) return;
                if (!res.success) throw new Error(res.error);

                setPreview(res.data);
              }),
            PREVIEW_DELAY,
          )
        : null;

    return () => clearTimeout(timeout);
  }, [count, items, options, title, settings.file.ratingDisplay]);

  const handleClose = () => store.setIsExportOpen(false);

  const handleSave = async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${title.trim() || "Rankings"}.png`,
      filters: [{ extensions: ["png"], name: "PNG Image" }],
    });
    if (canceled || !filePath) return;

    setIsSaving(true);

    try {
      const res = await store.renderExport({
        options,
        outputPath: filePath,
        tiles: makeTiles(),
        title,
      });
      if (!res.success) throw new Error(res.error);

      toast.success(`Saved ${path.basename(filePath)}`);

      if (res.data.failedCount)
        toast.warn(
          `${Fmt.commas(res.data.failedCount)} images could not be read and were left empty`,
        );

      // The options are kept for the next export.
      settings.update({ [EXPORT_CONFIG_KEY]: options });

      const saved = await settings.save();
      if (!saved.success) throw new Error(saved.error);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const makeOptionSetter =
    <Key extends keyof MediaProgramRankingExport>(key: Key) =>
    (value: MediaProgramRankingExport[Key]) =>
      setOptions((prev) => ({ ...prev, [key]: value }));

  /**
   * The top programs in ranked order, each with its rating as displayed and its downloaded cover art,
   * or else its first episode.
   */
  const makeTiles = (): MediaProgramRankingTile[] => {
    const filesById = new Map(items.files.map((file) => [file.id, file]));

    return items.programs.slice(0, count).map((program, index) => {
      const file = filesById.get(program.posterFileId);
      const ratingMeta = getRatingMeta(program.rating, settings.file.ratingDisplay);

      return {
        details: getMediaProgramDetails(program),
        image: program.meta?.posterPath
          ? { path: program.meta.posterPath }
          : !file
            ? null
            : getIsImage(file.ext) && !getIsAnimated(file.ext)
              ? { path: file.path }
              : file.thumb,
        name: program.name,
        rank: index + 1,
        rating:
          program.rating > 0
            ? {
                color: ratingMeta.textColor ?? colors.custom.white,
                text: ratingMeta.text,
              }
            : null,
      };
    });
  };

  return (
    <Modal.Container
      isLoading={isSaving}
      onClose={handleClose}
      height="100%"
      width="100%"
      maxWidth="72rem"
    >
      <Modal.Header>
        <Text preset="title">{"Export Ranking"}</Text>
      </Modal.Header>

      <Modal.Content dividers={false} row spacing="0.5rem" overflow="hidden">
        <Card flex="none" width="18rem" spacing="0.5rem" overflow="hidden auto">
          <Input header="Title" value={title} setValue={setTitle} />

          <UniformList row spacing="0.5rem">
            <NumInput
              header="Columns"
              value={options.columns}
              setValue={makeOptionSetter("columns")}
              minValue={MEDIA_PROGRAM_RANKING_LIMITS.columns.min}
              maxValue={MEDIA_PROGRAM_RANKING_LIMITS.columns.max}
            />

            <NumInput
              header="Rows"
              value={options.rows}
              setValue={makeOptionSetter("rows")}
              minValue={MEDIA_PROGRAM_RANKING_LIMITS.rows.min}
              maxValue={MEDIA_PROGRAM_RANKING_LIMITS.rows.max}
            />
          </UniformList>

          <UniformList row spacing="0.5rem">
            <NumInput
              header="Width (px)"
              value={options.width}
              setValue={makeOptionSetter("width")}
              minValue={MEDIA_PROGRAM_RANKING_LIMITS.width.min}
              maxValue={MEDIA_PROGRAM_RANKING_LIMITS.width.max}
            />

            <NumInput
              header="Gap (px)"
              value={options.gap}
              setValue={makeOptionSetter("gap")}
              minValue={MEDIA_PROGRAM_RANKING_LIMITS.gap.min}
              maxValue={MEDIA_PROGRAM_RANKING_LIMITS.gap.max}
            />
          </UniformList>

          <Dropdown
            header="Tile Shape"
            options={[...MEDIA_PROGRAM_RANKING_ASPECT_RATIOS]}
            value={options.aspectRatio}
            setValue={makeOptionSetter("aspectRatio")}
          />

          <View column>
            {TOGGLES.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={options[key]}
                setChecked={makeOptionSetter(key)}
              />
            ))}
          </View>
        </Card>

        <Card flex={1} position="relative" align="center" justify="center" overflow="hidden">
          <LoadingOverlay isLoading={programsLoad.isLoading || previewLoad.isLoading} />

          {limitError ? (
            <CenteredText text={limitError} />
          ) : preview ? (
            <View
              component="img"
              src={preview.dataUrl}
              alt={title}
              maxHeight="100%"
              maxWidth="100%"
            />
          ) : (
            <CenteredText text="No preview" />
          )}

          {!limitError && preview?.failedCount > 0 && (
            <Text color={colors.custom.orange}>
              {`${Fmt.commas(preview.failedCount)} images could not be read and are left empty`}
            </Text>
          )}
        </Card>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} colorOnHover={colors.custom.red} />

        <Button
          text="Save PNG"
          icon="SaveAlt"
          onClick={handleSave}
          disabled={!!limitError || !preview || isSaving || items?.count !== count}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
