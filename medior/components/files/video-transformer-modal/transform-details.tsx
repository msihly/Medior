import { Comp, Detail, Text, UniformList, View } from "medior/components";
import { FileTransform } from "medior/store";
import { Fmt, round } from "medior/utils/common";
import { DuplicateReview } from "./duplicate-review";
import { getDetailLabelProps, InputOutputRow } from "./input-output-row";

export const TransformDetails = Comp(
  ({ transform, compact = false }: { compact?: boolean; transform: FileTransform }) => {
    const outputSize = transform.afterSize ?? transform.progressSize;
    const detailLabelProps = getDetailLabelProps(compact);

    return (
      <View column spacing={compact ? "0.35rem" : "0.8rem"} overflow="visible">
        <UniformList column spacing={compact ? "0.25rem" : "0.5rem"}>
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
              output={getOutputCodec(transform)}
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
            output={getOutputDimensions(transform)}
          />

          {transform.isAnimated && (
            <>
              <InputOutputRow
                compact={compact}
                label="FPS"
                input={transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--"}
                output={getOutputFrameRate(transform)}
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
            labelProps={detailLabelProps}
            value={
              <View row align="center" spacing={compact ? "0.6rem" : "1rem"}>
                <Text width={compact ? "5.5rem" : "6rem"} whiteSpace="nowrap">
                  {transform.beforeSize && outputSize
                    ? `${round(transform.beforeSize / outputSize)}x`
                    : "--"}
                </Text>

                {transform.type === "splice" && (
                  <Detail
                    row
                    label="Mode"
                    labelProps={{ alignSelf: "center", fontSize: detailLabelProps.fontSize }}
                    value={transform.isSpliceCopy ? "Copy" : "Replace"}
                  />
                )}
              </View>
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
