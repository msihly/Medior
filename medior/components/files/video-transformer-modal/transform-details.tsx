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
    withAutoReplace = false,
    withQueueTotals = false,
  }: {
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
      <View column spacing="0.8rem" overflow="visible">
        <UniformList column spacing="0.5rem">
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
            label="Codec"
            input={transform.beforeVideoCodec || "--"}
            output={outputCodec}
          />

          <InputOutputRow
            label="Dimensions"
            input={
              transform.beforeWidth && transform.beforeHeight
                ? `${transform.beforeWidth}x${transform.beforeHeight}`
                : "--"
            }
            output={outputDimensions}
          />

          <InputOutputRow
            label="FPS"
            input={transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--"}
            output={outputFrameRate}
          />

          <InputOutputRow
            label="Bitrate"
            input={transform.beforeBitrate ? Fmt.bytes(transform.beforeBitrate) : "--"}
            output={
              transform.afterBitrate
                ? Fmt.bytes(transform.afterBitrate)
                : transform.configMaxBitrate
                  ? Fmt.bytes(transform.configMaxBitrate * 1000)
                  : "--"
            }
          />

          <InputOutputRow
            label="Size"
            input={transform.beforeSize ? Fmt.bytes(transform.beforeSize) : "--"}
            output={outputSize ? Fmt.bytes(outputSize) : "--"}
          />

          <Detail
            row
            label="Ratio"
            labelProps={{ width: "6rem", fontSize: "1em", alignSelf: "center" }}
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
  if (transform.type === "remux") return transform.beforeVideoCodec || "--";
  if (transform.type === "splice") return "--";
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

const getOutputDimensions = (transform: FileTransform) => {
  if (transform.afterWidth && transform.afterHeight)
    return `${transform.afterWidth}x${transform.afterHeight}`;
  if (transform.type === "remux")
    return transform.beforeWidth && transform.beforeHeight
      ? `${transform.beforeWidth}x${transform.beforeHeight}`
      : "--";
  if (
    transform.type !== "reencode" ||
    !transform.beforeWidth ||
    !transform.beforeHeight ||
    !transform.configMaxWidth ||
    !transform.configMaxHeight
  )
    return "--";

  const scale = Math.min(
    1,
    transform.configMaxWidth / transform.beforeWidth,
    transform.configMaxHeight / transform.beforeHeight,
  );
  const width = Math.floor((transform.beforeWidth * scale) / 2) * 2;
  const height = Math.floor((transform.beforeHeight * scale) / 2) * 2;
  return `${width}x${height}`;
};

const getOutputFrameRate = (transform: FileTransform) => {
  if (transform.afterFrameRate) return round(transform.afterFrameRate);
  if (transform.type === "remux")
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  if (transform.type !== "reencode") return "--";
  if (!transform.configMaxFps)
    return transform.beforeFrameRate ? round(transform.beforeFrameRate) : "--";
  if (!transform.beforeFrameRate) return transform.configMaxFps;
  return round(Math.min(transform.beforeFrameRate, transform.configMaxFps));
};

interface InputOutputRowProps {
  input: ReactNode;
  label: string;
  output: ReactNode;
}

const InputOutputRow = Comp(({ input, label, output }: InputOutputRowProps) => (
  <Detail
    row
    label={label}
    labelProps={{ width: "6rem", fontSize: "1em", alignSelf: "center" }}
    value={
      <View row align="center" spacing="1rem">
        <Text width="6rem" whiteSpace="nowrap">
          {input}
        </Text>

        <Icon name="ArrowRightAlt" />

        <Text width="6rem" whiteSpace="nowrap">
          {output}
        </Text>
      </View>
    }
  />
));
