import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileSchema } from "medior/_generated/server";
import { Icon, View } from "medior/components";
import { colors, CSS, makeClasses, useElementResize, useLazyLoad } from "medior/utils/client";
import { sleep } from "medior/utils/common";
import { getScaledThumbSize } from "medior/utils/server";

const POS_INTERVAL = 300;

const VIDEO_POSITIONS = {
  1: "top left",
  2: "top center",
  3: "top right",
  4: "center left",
  5: "center center",
  6: "center right",
  7: "bottom left",
  8: "bottom center",
  9: "bottom right",
};

type ImageProps = Omit<
  DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>,
  "alt" | "height" | "medior" | "title" | "width"
> & {
  autoAnimate?: boolean;
  blur?: number;
  children?: ReactNode | ReactNode[];
  draggable?: boolean;
  fit?: "contain" | "cover";
  height?: CSS["height"];
  rounded?: "all" | "bottom" | "top";
  title?: string;
} & (
    | { thumb: FileSchema["thumb"]; thumbs?: never }
    | { thumb?: never; thumbs: FileSchema["thumb"][] }
  );

export const Image = ({
  autoAnimate,
  blur,
  children,
  className,
  draggable,
  fit = "contain",
  height,
  loading = "lazy",
  onDragEnd,
  onDragStart,
  rounded = "all",
  thumb,
  thumbs,
  title,
}: ImageProps) => {
  const thumbInterval = useRef<NodeJS.Timeout>(null);
  const videoPosInterval = useRef<NodeJS.Timeout>(null);
  const clearIntervals = () => {
    clearInterval(thumbInterval.current);
    clearInterval(videoPosInterval.current);
  };

  const [hasError, setHasError] = useState(false);
  const [imagePos, setImagePos] = useState<string>("center");
  const [thumbIndex, setThumbIndex] = useState(0);
  const [videoPosIndex, setVideoPosIndex] = useState(1);

  const curThumb = thumbs?.[thumbIndex] ?? thumb;
  const isAnimated = curThumb?.frameHeight > 0 && curThumb?.frameWidth > 0;
  const scaled = isAnimated ? getScaledThumbSize(curThumb.frameWidth, curThumb.frameHeight) : null;
  const videoPos = isAnimated ? VIDEO_POSITIONS[videoPosIndex] : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const containerDims = useElementResize(containerRef);
  const isVisible = useLazyLoad(containerRef);

  useEffect(() => {
    if (!isVisible) clearIntervals();
    else {
      setHasError(false);
      setThumbIndex(0);
      setVideoPosIndex(1);
      setImagePos("center");
      clearIntervals();
      if (autoAnimate) createThumbInterval();
    }
  }, [isVisible]);

  const getThumbScale = () => {
    if (!scaled || !containerDims) return;
    const isVertical = scaled.height > scaled.width;
    const isContainerLarger = isVertical
      ? containerDims.height > scaled.height
      : containerDims.width > scaled.width;
    const scaleFactor = isContainerLarger
      ? isVertical
        ? containerDims.height / scaled.height
        : containerDims.width / scaled.width
      : isVertical
        ? scaled.height / containerDims.height
        : containerDims.width / scaled.width;
    return scaleFactor;
  };

  const { css, cx } = useClasses({
    blur,
    fit,
    height: scaled?.height ?? height,
    isAnimated,
    rounded,
    width: scaled?.width,
  });

  useEffect(() => {
    if (autoAnimate && isVisible) createThumbInterval();
    return () => clearIntervals();
  }, []);

  const createThumbInterval = () => {
    if (isAnimated) {
      videoPosInterval.current = setInterval(
        () => setVideoPosIndex((prev) => (prev + 1 > 9 ? 1 : prev + 1)),
        POS_INTERVAL,
      );
    }

    if (thumbs?.length > 1) {
      const totalDuration = thumbs.reduce((acc, t) => ((acc += getThumbInterval(t)), acc), 0);

      const loopThumbs = async () => {
        for (const t of thumbs) {
          if (!thumbInterval.current) break;
          setThumbIndex((prev) => (prev + 1 >= thumbs.length ? 0 : prev + 1));
          await sleep(getThumbInterval(t));
        }
      };

      thumbInterval.current = setInterval(loopThumbs, totalDuration);
      loopThumbs();
    }
  };

  const getThumbInterval = (t: FileSchema["thumb"]) =>
    POS_INTERVAL * (t.frameHeight > 0 && t.frameWidth > 0 ? 9 : 1);

  const handleError = () => {
    setHasError(true);
    clearIntervals();
  };

  const handleMouseEnter = () => {
    clearIntervals();
    createThumbInterval();
  };

  const handleMouseLeave = () => {
    clearIntervals();
    thumbInterval.current = null;
    setThumbIndex(0);

    setImagePos("center");
    setVideoPosIndex(1);
    setHasError(false);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const offsetY = event.pageY - top;
    if (!isAnimated)
      setImagePos(
        `${(Math.max(0, offsetX) / width) * 100}% ${(Math.max(0, offsetY) / height) * 100}%`,
      );
  };

  return (
    <View
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cx(css.imageContainer, className)}
    >
      {hasError ? (
        <View className={css.image}>
          <Icon
            name="ImageNotSupported"
            size="4rem"
            color={colors.custom.grey}
            viewProps={{ align: "center", height: "100%" }}
          />
        </View>
      ) : curThumb && isVisible ? (
        <img
          {...{ draggable, loading, onDragEnd, onDragStart }}
          src={curThumb.path}
          alt={title}
          onError={handleError}
          onMouseMove={fit === "cover" ? handleMouseMove : undefined}
          className={css.image}
          style={{
            transform: `scale(${getThumbScale()})`,
            objectPosition:
              fit === "cover" || isAnimated ? (isAnimated ? videoPos : imagePos) : undefined,
          }}
        />
      ) : (
        <View className={css.image} />
      )}

      {children}
    </View>
  );
};

interface ClassesProps {
  blur: number;
  fit: ImageProps["fit"];
  height: CSS["height"];
  isAnimated: boolean;
  rounded: ImageProps["rounded"];
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  image: {
    ...(["all", "top"].includes(props.rounded) && {
      borderTopLeftRadius: "inherit",
      borderTopRightRadius: "inherit",
    }),
    ...(["all", "bottom"].includes(props.rounded) && {
      borderBottomLeftRadius: "inherit",
      borderBottomRightRadius: "inherit",
    }),
    height: props.height ?? (props.fit === "cover" && !props.isAnimated ? "inherit" : undefined),
    width: props.width ?? "100%",
    objectFit: props.isAnimated ? "none" : props.fit === "cover" ? "cover" : "contain",
    transition: `all 100ms ease, object-position ${props.fit === "cover" && !props.isAnimated ? 100 : 0}ms ease-in-out, transform 0ms ease`,
    userSelect: "none",
    overflow: "hidden",
    ...(props.blur > 0 ? { filter: `blur(${props.blur}px)` } : {}),
  },
  imageContainer: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "inherit",
    height: "100%",
    ...(["all", "top"].includes(props.rounded) && {
      borderTopLeftRadius: "inherit",
      borderTopRightRadius: "inherit",
    }),
    ...(["all", "bottom"].includes(props.rounded) && {
      borderBottomLeftRadius: "inherit",
      borderBottomRightRadius: "inherit",
    }),
    backgroundColor: "inherit",
    overflow: "hidden",
  },
}));
