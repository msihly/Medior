import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, View } from "medior/components";
import { colors, CSS, debounce, getScaledThumbSize, makeClasses } from "medior/utils";
import { File } from "medior/store";

interface ImageProps
  extends Omit<
    DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>,
    "alt" | "height" | "medior" | "title" | "width"
  > {
  autoAnimate?: boolean;
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  draggable?: boolean;
  file?: File;
  fit?: "contain" | "cover";
  height?: CSS["height"];
  rounded?: "all" | "bottom" | "top";
  title?: string;
  thumbPaths: string[];
}

export const Image = ({
  autoAnimate = false,
  children,
  className,
  disabled,
  draggable = false,
  file,
  fit = "cover",
  height,
  loading = "lazy",
  onDragEnd,
  onDragStart,
  rounded = "all",
  thumbPaths,
  title,
}: ImageProps) => {
  const thumbInterval = useRef(null);

  const [hasError, setHasError] = useState(false);
  const [imagePos, setImagePos] = useState<CSS["objectPosition"]>(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const isAnimated = !disabled && !autoAnimate && file?.isAnimated;
  const scaled = getScaledThumbSize(file.width, file.height);
  const videoPos = `${(thumbIndex % 3) * -scaled.width}px ${(Math.floor(thumbIndex / 3) % 3) * -scaled.height}px`;

  const { css, cx } = useClasses({
    fit,
    height,
    imagePos: isAnimated ? videoPos : imagePos,
    isAnimated,
    rounded,
  });

  useEffect(() => {
    if (autoAnimate) createThumbInterval();
    return () => clearInterval(thumbInterval.current);
  }, []);

  const handleError = () => {
    setHasError(true);
    clearInterval(thumbInterval.current);
  };

  const createThumbInterval = () => {
    if (file?.width > 0 && file?.height > 0)
      thumbInterval.current = setInterval(() => {
        setThumbIndex((prev) => {
          const newIndex = prev + 1 >= 9 ? 0 : prev + 1;
          return newIndex;
        });
      }, 300);
  };

  const handleMouseEnter = () => {
    clearInterval(thumbInterval.current);
    createThumbInterval();
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
    setImagePos(null);
    setHasError(false);
  };

  const debouncedMouseMove = debounce((height, width, offsetX, offsetY) => {
    if (!isAnimated)
      setImagePos(
        `${(Math.max(0, offsetX) / width) * 100}% ${(Math.max(0, offsetY) / height) * 100}%`
      );
  }, 100);

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const offsetY = event.pageY - top;
    debouncedMouseMove(height, width, offsetX, offsetY);
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
      ) : thumbPaths?.length > 0 ? (
        <img
          {...{ draggable, loading, onDragEnd, onDragStart }}
          src={thumbPaths[0]}
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
    objectFit: "none",
    objectPosition: props.fit === "cover" || props.isAnimated ? props.imagePos : undefined,
    transition: `all 100ms ease, object-position ${props.fit === "cover" && !props.isAnimated ? 100 : 0}ms ease-in-out`,
    userSelect: "none",
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
