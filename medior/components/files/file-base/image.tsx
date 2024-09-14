import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, View } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils";

interface ImageProps
  extends Omit<
    DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>,
    "alt" | "height" | "medior" | "title" | "width"
  > {
  autoAnimate?: boolean;
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  draggable?: boolean;
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

  const { css, cx } = useClasses({ fit, height, imagePos, rounded });

  const hasListeners = !disabled && !autoAnimate && thumbPaths?.length > 1;

  const createThumbInterval = () => {
    thumbInterval.current = setInterval(() => {
      setHasError(false);
      setThumbIndex((thumbIndex) => (thumbIndex + 1 === thumbPaths?.length ? 0 : thumbIndex + 1));
    }, 300);
  };

  useEffect(() => {
    if (!autoAnimate) return;
    createThumbInterval();
    return () => clearInterval(thumbInterval.current);
  }, []);

  const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true);
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

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const offsetY = event.pageY - top;
    const pos = `${(Math.max(0, offsetX) / width) * 100}% ${
      (Math.max(0, offsetY) / height) * 100
    }%`;

    setImagePos(pos);
  };

  return (
    <View
      onMouseEnter={hasListeners ? handleMouseEnter : undefined}
      onMouseLeave={hasListeners ? handleMouseLeave : undefined}
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
          src={thumbPaths[thumbIndex]}
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
  rounded: ImageProps["rounded"];
}

const useClasses = makeClasses(({ fit, height, imagePos, rounded }: ClassesProps, theme) => ({
  image: {
    ...(["all", "top"].includes(rounded) && {
      borderTopLeftRadius: "inherit",
      borderTopRightRadius: "inherit",
    }),
    ...(["all", "bottom"].includes(rounded) && {
      borderBottomLeftRadius: "inherit",
      borderBottomRightRadius: "inherit",
    }),
    height: height ?? "inherit",
    width: "100%",
    userSelect: "none",
    transition: "all 100ms ease",
    objectFit: fit,
    objectPosition: imagePos,
  },
  imageContainer: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    borderRadius: "inherit",
    height: "100%",
    ...(["all", "top"].includes(rounded) && {
      borderTopLeftRadius: "inherit",
      borderTopRightRadius: "inherit",
    }),
    ...(["all", "bottom"].includes(rounded) && {
      borderBottomLeftRadius: "inherit",
      borderBottomRightRadius: "inherit",
    }),
    backgroundColor: "inherit",
    overflow: "hidden",
  },
}));
