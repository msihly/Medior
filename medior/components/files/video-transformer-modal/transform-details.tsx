import { Comp, Detail, Divider, UniformList, View } from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { Fmt, round } from "medior/utils/common";
import { DuplicateReview } from "./duplicate-review";
import { InputOutputRow } from "./input-output-row";

export const TransformDetails = Comp(
  ({
    transform,
    compact = false,
    withQueueTotals = false,
  }: {
    compact?: boolean;
    transform: FileTransform;
    withQueueTotals?: boolean;
  }) => {
    const stores = useStores();
    const store = stores.file.videoTransformer;

    const outputSize = transform.afterSize ?? transform.progressSize;
    const outputCodec = getOutputCodec(transform);
    const outputDimensions = getOutputDimensions(transform);
    const outputFrameRate = getOutputFrameRate(transform);

    return (
      <View column spacing={compact ? "0.35rem" : "0.8rem"} overflow="visible">
        <UniformList column spacing={compact ? "0.25rem" : "0.5rem"}>
          {withQueueTotals && transform.type !== "splice" ? (
            <>
              <InputOutputRow
                label="Total"
                input={Fmt.bytes(store.queueBeforeSize)}
                output={Fmt.bytes(store.queueAfterSize)}
              />

              <Divider style={{ flex: 0 }} />
            </>
          ) : null}

          <InputOutputRow
            compact={compact}
            label="Ext"
            input={transform.beforeExt || "--"}
            output={transform.afterExt || getOutputExt(transform)}
          />

          {transform.isAnimated && (
            <InputOutputRow
              compact={compact}
              label="Codec"
              input={transform.beforeVideoCodec || "--"}
              output={outputCodec}
            />
          )}

          <InputOutputRow
            compact={compact}
            label="Dimensions"
            input={
              transform.beforeWidth && transform.beforeHeight
                ? `${transform.beforeWidth}x${transform.beforeHeight}`
                : "--"
            }
            output={outputDimensions}
          />

          {transform.isAnimated && (
            <>
              <InputOutputRow
                compact={compact}
                label="FPS"
                input={transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--"}
                output={outputFrameRate}
              />

              <InputOutputRow
                compact={compact}
                label="Bitrate"
                input={transform.beforeBitrate ? Fmt.bytes(transform.beforeBitrate) : "--"}
                output={getOutputBitrate(transform)}
              />
            </>
          )}

          <InputOutputRow
            compact={compact}
            label="Size"
            input={transform.beforeSize ? Fmt.bytes(transform.beforeSize) : "--"}
            output={outputSize ? Fmt.bytes(outputSize) : "--"}
          />

          <Detail
            row
            label="Ratio"
            labelProps={{
              alignSelf: "center",
              fontSize: compact ? "0.9em" : "1em",
              width: compact ? "5rem" : "6rem",
            }}
            value={
              transform.beforeSize && outputSize
                ? `${round(transform.beforeSize / outputSize)}x`
                : "--"
            }
          />
        </UniformList>

        <DuplicateReview transform={transform} />
      </View>
    );
  },
);

const getOutputCodec = (transform: FileTransform) => {
  if (transform.afterVideoCodec) return transform.afterVideoCodec;
  if (!transform.beforeVideoCodec && transform.beforeExt !== "gif") return "--";
  if (["remux", "splice"].includes(transform.type)) return transform.beforeVideoCodec || "--";

  return (
    {
      libaom_av1: "av1",
      "libaom-av1": "av1",
      libaomAv1: "av1",
      "libsvt-av1": "av1",
      libvpx: "vp8",
      libvpx_vp9: "vp9",
      libvpxVp9: "vp9",
      libx264: "h264",
      libx265: "hevc",
    }[transform.configCodec] ??
    transform.configCodec ??
    "--"
  );
};

const getOutputExt = (transform: FileTransform) => {
  if (transform.type === "remux") return "mp4";
  if (transform.type === "splice") return "mp4";
  if (transform.type !== "reencode") return "--";
  if (transform.beforeExt === "gif") return "mp4";
  if (!transform.beforeVideoCodec) return transform.configImageExt || "--";

  return "mp4";
};

const getOutputDimensions = (transform: FileTransform) => {
  if (transform.afterWidth && transform.afterHeight)
    return `${transform.afterWidth}x${transform.afterHeight}`;
  if (["remux", "splice"].includes(transform.type))
    return transform.beforeWidth && transform.beforeHeight
      ? `${transform.beforeWidth}x${transform.beforeHeight}`
      : "--";
  if (transform.type !== "reencode" || !transform.beforeWidth || !transform.beforeHeight)
    return "--";

  const maxWidth = transform.isAnimated ? transform.configMaxWidth : transform.configImageMaxWidth;

  const maxHeight = transform.isAnimated
    ? transform.configMaxHeight
    : transform.configImageMaxHeight;
  if (!maxWidth || !maxHeight) return "--";

  const scale = Math.min(1, maxWidth / transform.beforeWidth, maxHeight / transform.beforeHeight);

  const width = transform.isAnimated
    ? Math.floor((transform.beforeWidth * scale) / 2) * 2
    : Math.round(transform.beforeWidth * scale);

  const height = transform.isAnimated
    ? Math.floor((transform.beforeHeight * scale) / 2) * 2
    : Math.round(transform.beforeHeight * scale);

  return `${width}x${height}`;
};

const getOutputFrameRate = (transform: FileTransform) => {
  if (transform.afterFrameRate) return round(transform.afterFrameRate);
  if (["remux", "splice"].includes(transform.type))
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  if (transform.type !== "reencode") return "--";
  if (!transform.configMaxFps)
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  if (!transform.beforeFrameRate) return transform.configMaxFps;

  return round(Math.min(transform.beforeFrameRate, transform.configMaxFps));
};

const getOutputBitrate = (transform: FileTransform) => {
  if (transform.afterBitrate) return Fmt.bytes(transform.afterBitrate);
  if (["remux", "splice"].includes(transform.type))
    return transform.beforeBitrate ? Fmt.bytes(transform.beforeBitrate) : "--";

  return transform.configMaxBitrate ? Fmt.bytes(transform.configMaxBitrate * 1000) : "--";
};
