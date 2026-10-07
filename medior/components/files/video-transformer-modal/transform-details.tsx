import { Comp, Detail, Divider, UniformList, View } from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { makeClasses } from "medior/utils/client";
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

    const { css } = useClasses(null);

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

              <Divider className={css.divider} />
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

const getOutputBitrate = (transform: FileTransform) => {
  if (transform.afterBitrate) return Fmt.bytes(transform.afterBitrate);
  else if (["remux", "splice"].includes(transform.type))
    return transform.beforeBitrate ? Fmt.bytes(transform.beforeBitrate) : "--";
  else return transform.configMaxBitrate ? Fmt.bytes(transform.configMaxBitrate * 1000) : "--";
};

const getOutputCodec = (transform: FileTransform) => {
  if (transform.afterVideoCodec) return transform.afterVideoCodec;
  else if (!transform.beforeVideoCodec && transform.beforeExt !== "gif") return "--";
  else if (["remux", "splice"].includes(transform.type)) return transform.beforeVideoCodec || "--";
  else
    return (
      {
        "libaom-av1": "av1",
        libaomAv1: "av1",
        libaom_av1: "av1",
        "libsvt-av1": "av1",
        libvpx: "vp8",
        libvpxVp9: "vp9",
        libvpx_vp9: "vp9",
        libx264: "h264",
        libx265: "hevc",
      }[transform.configCodec] ??
      transform.configCodec ??
      "--"
    );
};

const getOutputDimensions = (transform: FileTransform) => {
  if (transform.afterWidth && transform.afterHeight)
    return `${transform.afterWidth}x${transform.afterHeight}`;
  else if (["remux", "splice"].includes(transform.type))
    return transform.beforeWidth && transform.beforeHeight
      ? `${transform.beforeWidth}x${transform.beforeHeight}`
      : "--";
  else if (transform.type !== "reencode" || !transform.beforeWidth || !transform.beforeHeight)
    return "--";
  else {
    const maxWidth = transform.isAnimated
      ? transform.configMaxWidth
      : transform.configImageMaxWidth;
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
  }
};

const getOutputExt = (transform: FileTransform) => {
  if (["remux", "splice"].includes(transform.type)) return "mp4";
  else if (transform.type !== "reencode") return "--";
  else if (transform.beforeExt === "gif") return "mp4";
  else if (!transform.beforeVideoCodec) return transform.configImageExt || "--";
  else return "mp4";
};

const getOutputFrameRate = (transform: FileTransform) => {
  if (transform.afterFrameRate) return round(transform.afterFrameRate);
  else if (["remux", "splice"].includes(transform.type))
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  else if (transform.type !== "reencode") return "--";
  else if (!transform.configMaxFps)
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  else if (!transform.beforeFrameRate) return transform.configMaxFps;
  else return round(Math.min(transform.beforeFrameRate, transform.configMaxFps));
};

const useClasses = makeClasses({
  divider: {
    flex: 0,
  },
});
