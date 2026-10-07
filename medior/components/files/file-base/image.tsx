import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileSchema, SocketEvents } from "medior/_generated/server";
import { Icon, View } from "medior/components";
import { colors, CSS, makeClasses, useElementResize, useLazyLoad } from "medior/utils/client";
import { socket, trpc } from "medior/utils/server";
import { getScaledThumbSize } from "medior/utils/server/videos";

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
  fileId?: string;
  fit?: "contain" | "cover";
  height?: CSS["height"];
  isCorrupted?: boolean;
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
  fileId,
  height,
  isCorrupted,
  loading = "lazy",
  onDragEnd,
  onDragStart,
  rounded = "all",
  thumb,
  thumbs,
  title,
}: ImageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isRepairingThumbnail = useRef(false);
  const repairAttempted = useRef(false);
  const repairReadinessRevision = useRef(0);
  const repairRevision = useRef(0);
  const waitingForIndex = useRef(false);

  const [hasError, setHasError] = useState(false);
  const [imagePos, setImagePos] = useState<string>("center");
  const [isHovered, setIsHovered] = useState(false);
  const [repairedThumb, setRepairedThumb] = useState<FileSchema["thumb"]>();
  const [thumbIndex, setThumbIndex] = useState(0);
  const [videoPosIndex, setVideoPosIndex] = useState(1);

  const sourceThumb = thumbs?.[thumbIndex] ?? thumb;
  const curThumb = repairedThumb ?? sourceThumb;
  const isAnimated = curThumb?.frameHeight > 0 && curThumb?.frameWidth > 0;
  const scaled = isAnimated ? getScaledThumbSize(curThumb.frameWidth, curThumb.frameHeight) : null;
  const videoPos = isAnimated ? VIDEO_POSITIONS[videoPosIndex] : null;

  const containerDims = useElementResize(containerRef);
  const isVisible = useLazyLoad(containerRef);
  const shouldAnimate = isVisible && !hasError && (autoAnimate || isHovered);

  useEffect(() => {
    isRepairingThumbnail.current = false;
    repairAttempted.current = false;
    waitingForIndex.current = false;
    setRepairedThumb(undefined);
    setHasError(false);

    return () => {
      repairRevision.current++;
    };
  }, [fileId, sourceThumb?.path]);

  const resumeThumbnailRepair = () => {
    if (waitingForIndex.current) {
      waitingForIndex.current = false;
      repairAttempted.current = false;
      setHasError(false);
    }
  };

  useEffect(() => {
    const handleReady = () => {
      repairReadinessRevision.current++;
      resumeThumbnailRepair();
    };

    const handleOperation = ({
      updates,
    }: Parameters<SocketEvents["onBackgroundOperationUpdated"]>[0]) => {
      if (updates.type === "mediaPathIndex" && updates.status === "COMPLETE") handleReady();
    };

    socket.on("onBackgroundOperationUpdated", handleOperation);
    socket.on("connected", handleReady);

    return () => {
      socket.off("onBackgroundOperationUpdated", handleOperation);
      socket.off("connected", handleReady);
    };
  }, [fileId]);

  useEffect(() => {
    if (!isVisible) setIsHovered(false);
    else {
      setHasError(false);
      setRepairedThumb(undefined);
      repairAttempted.current = false;
      setThumbIndex(0);
      setVideoPosIndex(1);
      setImagePos("center");
    }
  }, [isVisible]);

  const getThumbScale = () => {
    if (!scaled || !containerDims) return;

    const isVertical = scaled.height > scaled.width;

    const scaleFactor = isVertical
      ? containerDims.height / scaled.height
      : containerDims.width / scaled.width;

    return Math.max(1, scaleFactor);
  };

  const { css, cx } = useClasses({
    blur,
    fit,
    height: scaled?.height ?? height,
    isAnimated,
    objectPosition: fit === "cover" || isAnimated ? (isAnimated ? videoPos : imagePos) : undefined,
    rounded,
    scale: getThumbScale(),
    width: scaled?.width,
  });

  useEffect(() => {
    const timeout =
      shouldAnimate && thumbs?.length > 1
        ? setTimeout(
            () => setThumbIndex((prev) => (prev + 1) % thumbs.length),
            POS_INTERVAL * (isAnimated ? 9 : 1),
          )
        : null;

    return () => clearTimeout(timeout);
  }, [isAnimated, shouldAnimate, sourceThumb?.path, thumbIndex, thumbs?.length]);

  useEffect(() => {
    const interval =
      shouldAnimate && isAnimated
        ? setInterval(() => setVideoPosIndex((prev) => (prev % 9) + 1), POS_INTERVAL)
        : null;

    setVideoPosIndex(1);

    return () => clearInterval(interval);
  }, [isAnimated, shouldAnimate, curThumb?.path, thumbIndex]);

  const handleError = async () => {
    setHasError(true);

    if (!fileId || isCorrupted || isRepairingThumbnail.current || repairAttempted.current) return;

    const readinessRevision = repairReadinessRevision.current;
    const revision = repairRevision.current;

    repairAttempted.current = true;
    isRepairingThumbnail.current = true;
    waitingForIndex.current = false;

    try {
      const res = await trpc.repairFileThumbnail.mutate({ fileId });

      if (revision !== repairRevision.current) return;

      if (res.success && res.data.status === "repaired") {
        setRepairedThumb(res.data.thumb);
        setHasError(false);
      } else if (res.success && res.data.status === "waiting") {
        waitingForIndex.current = true;
      }
    } catch (error) {
      if (revision === repairRevision.current)
        console.error(`Failed to repair thumbnail for file ${fileId}:`, error);
    } finally {
      if (revision === repairRevision.current) {
        isRepairingThumbnail.current = false;

        if (readinessRevision !== repairReadinessRevision.current) resumeThumbnailRepair();
      }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setThumbIndex(0);
    setImagePos("center");
    setVideoPosIndex(1);
    setHasError(false);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - left;
    const offsetY = event.clientY - top;

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
        <View
          component="img"
          {...{ draggable, loading, onDragEnd, onDragStart }}
          src={curThumb.path}
          alt={title}
          onError={handleError}
          onMouseMove={fit === "cover" ? handleMouseMove : undefined}
          className={cx(css.image, css.thumbnail)}
        />
      ) : (
        <View className={css.image} />
      )}

      {children}
    </View>
  );
};

interface ClassesProps extends Pick<ImageProps, "blur" | "fit" | "rounded"> {
  height?: CSS["height"];
  isAnimated: boolean;
  objectPosition?: CSS["objectPosition"];
  scale?: number;
  width?: CSS["width"];
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
  thumbnail: {
    objectPosition: props.objectPosition,
    transform: props.scale === undefined ? undefined : `scale(${props.scale})`,
  },
}));
