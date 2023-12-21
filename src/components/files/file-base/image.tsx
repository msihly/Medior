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
  children?: ReactNode | ReactNode[];
  disabled?: boolean;
  draggable?: boolean;
  fit?: "contain" | "cover";
  height?: CSSObject["height"];
  rounded?: "all" | "bottom" | "top";
  title?: string;
  thumbPaths: string[];
  width?: CSSObject["width"];
}

export const Image = ({
  children,
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
  width,
}: ImageProps) => {
  const thumbInterval = useRef(null);

  const [imagePos, setImagePos] = useState<CSSObject["objectPosition"]>(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const { css } = useClasses({ fit, height, imagePos, rounded, width });

  useEffect(() => {
    return () => clearInterval(thumbInterval.current);
  }, []);

  const handleMouseEnter = () => {
    clearInterval(thumbInterval.current); /** Safety check for failed onMouseLeave */
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) => (thumbIndex + 1 === thumbPaths?.length ? 0 : thumbIndex + 1));
    }, 300);
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
      onMouseEnter={!disabled && thumbPaths?.length > 1 ? handleMouseEnter : undefined}
      onMouseLeave={!disabled && thumbPaths?.length > 1 ? handleMouseLeave : undefined}
      className={css.imageContainer}
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

const useClasses = makeClasses((theme, { fit, height, imagePos, rounded, width }) => ({
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
