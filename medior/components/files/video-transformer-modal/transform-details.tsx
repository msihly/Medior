import { ReactNode } from "react";
import {
  CenteredText,
  Checkbox,
  Comp,
  Detail,
  Divider,
  Icon,
  ProgressCircle as ProgressCircleBase,
  Text,
  UniformList,
  View,
} from "medior/components";
import { FileTransform, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { dayjs, Fmt, round } from "medior/utils/common";

export const ProgressCircle = Comp(({ transform }: { transform: FileTransform }) => (
  <ProgressCircleBase
    percent={transform.progress.percent}
    color={colors.custom.blue}
    bgColor={colors.custom.grey}
    size="13rem"
  >
    <CenteredText
      text={`${transform.progress.percent?.toFixed(2)}%`}
      color={colors.custom.blue}
      fontSize="1.5em"
      fontWeight={600}
    />

    <CenteredText text={transform.progress.time || "--"} color={colors.custom.white} />

    <CenteredText
      text={
        transform.beforeDuration
          ? dayjs.duration(transform.beforeDuration, "s").format("HH:mm:ss.SSS").substring(0, 11)
          : "--"
      }
      color={colors.custom.lightGrey}
    />
  </ProgressCircleBase>
));

export const TransformDetails = Comp(
  ({
    transform,
    compact = false,
    withAutoReplace = false,
    withQueueTotals = false,
  }: {
    compact?: boolean;
    transform: FileTransform;
    withAutoReplace?: boolean;
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
                input={store.queueBeforeSize ? Fmt.bytes(store.queueBeforeSize) : "--"}
                output={store.queueAfterSize ? Fmt.bytes(store.queueAfterSize) : "--"}
              />

              <Divider sx={{ flex: 0 }} />
            </>
          ) : null}

          <InputOutputRow
            compact={compact}
            label="Ext"
            input={transform.beforeExt || "--"}
            output={transform.afterExt || getOutputExt(transform)}
          />

          <InputOutputRow
            compact={compact}
            label="Codec"
            input={transform.beforeVideoCodec || "--"}
            output={outputCodec}
          />

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
              width: compact ? "5rem" : "6rem",
              fontSize: compact ? "0.9em" : "1em",
              alignSelf: "center",
            }}
            value={
              transform.beforeSize && outputSize
                ? `${round(transform.beforeSize / outputSize)}x`
                : "--"
            }
          />
        </UniformList>

        {withAutoReplace && transform.type !== "splice" ? (
          <Checkbox
            label="Auto-Replace"
            checked={store.isAuto}
            setChecked={store.setAutoReplace}
            flex="none"
            margins={{ left: "-0.5rem" }}
          />
        ) : null}
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
      "libaom-av1": "av1",
      "libsvt-av1": "av1",
      libaomAv1: "av1",
      libaom_av1: "av1",
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

  const maxWidth = !transform.beforeVideoCodec
    ? transform.configImageMaxWidth
    : transform.configMaxWidth;
  const maxHeight = !transform.beforeVideoCodec
    ? transform.configImageMaxHeight
    : transform.configMaxHeight;
  if (!maxWidth || !maxHeight) return "--";

  const scale = Math.min(1, maxWidth / transform.beforeWidth, maxHeight / transform.beforeHeight);
  const width = Math.floor((transform.beforeWidth * scale) / 2) * 2;
  const height = Math.floor((transform.beforeHeight * scale) / 2) * 2;
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

interface InputOutputRowProps {
  compact?: boolean;
  input: ReactNode;
  label: string;
  output: ReactNode;
}

const InputOutputRow = Comp(({ compact = false, input, label, output }: InputOutputRowProps) => (
  <Detail
    row
    label={label}
    labelProps={{
      width: compact ? "5rem" : "6rem",
      fontSize: compact ? "0.9em" : "1em",
      alignSelf: "center",
    }}
    value={
      <View row align="center" spacing={compact ? "0.6rem" : "1rem"}>
        <Text width={compact ? "5.5rem" : "6rem"} whiteSpace="nowrap">
          {input}
        </Text>

        <Icon name="ArrowRightAlt" />

        <Text width={compact ? "5.5rem" : "6rem"} whiteSpace="nowrap">
          {output}
        </Text>
      </View>
    }
  />
));
