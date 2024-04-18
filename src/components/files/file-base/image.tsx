import {
  DetailedHTMLProps,
  ImgHTMLAttributes,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "components";
import { makeClasses } from "utils";
import { CSSObject } from "tss-react";

interface ImageProps
  extends Omit<
    DetailedHTMLProps<ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>,
    "alt" | "height" | "src" | "title" | "width"
  > {
  autoAnimate?: boolean;
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  draggable?: boolean;
  fit?: "contain" | "cover";
  height?: CSSObject["height"];
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
  rounded = "top",
  thumbPaths,
  title,
}: ImageProps) => {
  const thumbInterval = useRef(null);

  const [imagePos, setImagePos] = useState<CSSObject["objectPosition"]>(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const { css, cx } = useClasses({ fit, height, imagePos, rounded });

  const hasListeners = !disabled && !autoAnimate && thumbPaths?.length > 1;

  const createThumbInterval = () => {
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) => (thumbIndex + 1 === thumbPaths?.length ? 0 : thumbIndex + 1));
    }, 300);
  };

  useEffect(() => {
    if (!autoAnimate) return;
    createThumbInterval();
    return () => clearInterval(thumbInterval.current);
  }, []);

  const handleMouseEnter = () => {
    clearInterval(thumbInterval.current);
    createThumbInterval();
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
    setImagePos(null);
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
      {thumbPaths?.length > 0 ? (
        <img
          {...{ draggable, loading, onDragEnd, onDragStart }}
          src={thumbPaths[thumbIndex]}
          alt={title}
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
  imagePos: CSSObject["objectPosition"];
  rounded: ImageProps["rounded"];
}

const useClasses = makeClasses((theme, { fit, height, imagePos, rounded }: ClassesProps) => ({
  image: {
    ...(["all", "top"].includes(rounded) && {
      borderTopLeftRadius: "inherit",
      borderTopRightRadius: "inherit",
    }),
    ...(["all", "bottom"].includes(rounded) && {
      borderBottomLeftRadius: "inherit",
      borderBottomRightRadius: "inherit",
    }),
    ...(height
      ? { height: height ?? "fit-content" }
      : {
          height: "16rem",
          [theme.breakpoints.down("xl")]: height ? undefined : { height: "16rem" },
          [theme.breakpoints.down("lg")]: height ? undefined : { height: "14rem" },
          [theme.breakpoints.down("md")]: height ? undefined : { height: "12rem" },
          [theme.breakpoints.down("sm")]: height ? undefined : { height: "12rem" },
        }),
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
