import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileCollectionSchema, FileSchema } from "medior/database";
import { Icon, View } from "medior/components";
import { colors, CSS, getScaledThumbSize, makeClasses } from "medior/utils";

type ImageProps = Omit<
  DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>,
  "alt" | "height" | "medior" | "title" | "width"
> & {
  animated?: boolean;
  autoAnimate?: boolean;
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  draggable?: boolean;
  fit?: "contain" | "cover";
  height?: CSS["height"];
  rounded?: "all" | "bottom" | "top";
  title?: string;
} & (
    | { thumb: FileSchema["thumb"]; thumbs?: never }
    | { thumb?: never; thumbs: FileCollectionSchema["thumbs"] }
  );

export const Image = ({
  animated,
  autoAnimate,
  children,
  className,
  disabled,
  draggable,
  fit = "cover",
  height,
  loading = "lazy",
  onDragEnd,
  onDragStart,
  rounded = "all",
  thumb,
  thumbs,
  title,
}: ImageProps) => {
  const thumbInterval = useRef(null);
  const videoPosInterval = useRef(null);
  const clearIntervals = () => {
    clearInterval(thumbInterval.current);
    clearInterval(videoPosInterval.current);
  };

  const [hasError, setHasError] = useState(false);
  const [imagePos, setImagePos] = useState<CSS["objectPosition"]>("center");
  const [thumbIndex, setThumbIndex] = useState(0);
  const [videoPosIndex, setVideoPosIndex] = useState(0);

  const isAnimated = !disabled && (animated || thumbs?.length > 0);
  const curThumb = thumbs?.[thumbIndex] ?? thumb;
  const scaled =
    curThumb?.frameHeight > 0 && curThumb?.frameWidth > 0
      ? getScaledThumbSize(curThumb.frameWidth, curThumb.frameHeight)
      : null;
  const videoPos = scaled
    ? `${(videoPosIndex % 3) * -scaled.width}px ${(Math.floor(videoPosIndex / 3) % 3) * -scaled.height}px`
    : null;

  const { css, cx } = useClasses({
    fit,
    height,
    imagePos: isAnimated ? videoPos : imagePos,
    isAnimated,
    rounded,
  });

  useEffect(() => {
    if (autoAnimate) createThumbInterval();
    return () => clearIntervals();
  }, []);

  const handleError = () => {
    setHasError(true);
    clearIntervals();
  };

  const createThumbInterval = () => {
    const maxThumbPaths = 9;
    const posInterval = 300;

    if (isAnimated) {
      videoPosInterval.current = setInterval(
        () => setVideoPosIndex((prev) => (prev + 1 >= maxThumbPaths ? 0 : prev + 1)),
        posInterval
      );
    }

    if (thumbs?.length > 1) {
      thumbInterval.current = setInterval(() => {
        setThumbIndex((prev) => (prev + 1 >= maxThumbPaths ? 0 : prev + 1));
      }, posInterval * maxThumbPaths);
    }
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
    setHasError(false);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const offsetY = event.pageY - top;
    if (!isAnimated)
      setImagePos(
        `${(Math.max(0, offsetX) / width) * 100}% ${(Math.max(0, offsetY) / height) * 100}%`
      );
  };

  return (
    <View
      onMouseEnter={isAnimated ? handleMouseEnter : undefined}
      onMouseLeave={isAnimated ? handleMouseLeave : undefined}
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
      ) : curThumb ? (
        <img
          {...{ draggable, loading, onDragEnd, onDragStart }}
          src={curThumb.path}
          alt={title}
          onError={handleError}
          onMouseMove={fit === "cover" ? handleMouseMove : undefined}
          onMouseLeave={fit === "cover" ? handleMouseLeave : undefined}
          className={css.image}
        />
      ) : (
        <View className={css.image} />
      )}

      {children}
    </View>
  );
};

interface ClassesProps {
  fit: ImageProps["fit"];
  height: ImageProps["height"];
  imagePos: CSS["objectPosition"];
  isAnimated: boolean;
  rounded: ImageProps["rounded"];
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
    width: "100%",
    objectFit: props.isAnimated ? "none" : props.fit === "cover" ? "cover" : undefined,
    objectPosition: props.fit === "cover" || props.isAnimated ? props.imagePos : undefined,
    transition: `all 100ms ease, object-position ${props.fit === "cover" && !props.isAnimated ? 100 : 0}ms ease-in-out`,
    userSelect: "none",
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
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
