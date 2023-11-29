import { useEffect, useRef, useState } from "react";
import { IconButton, View } from "components";
import { colors, debounce, makeClasses, useElementResize } from "utils";

interface SideScrollerProps {
  children: JSX.Element[];
  className?: string;
  innerClassName?: string;
}

export const SideScroller = ({ children, className, innerClassName }: SideScrollerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width } = useElementResize(ref);

  const [isLeftButtonVisible, setIsLeftButtonVisible] = useState(false);
  const [isRightButtonVisible, setIsRightButtonVisible] = useState(false);
  const [scrollPos, setScrollPos] = useState(0);

  const { css, cx } = useClasses({ isLeftButtonVisible, isRightButtonVisible });

  const getButtonVisibility = () => {
    if (!ref.current) return [false, false];
    const { clientWidth, scrollWidth, scrollLeft } = ref.current;

    if (!(clientWidth < scrollWidth)) return [false, false];
    return [scrollLeft > 0, clientWidth + scrollLeft < scrollWidth - 5];
  };

  const handleScroll = (direction: "left" | "right") => {
    if (!ref.current) return false;

    const maxLeft = ref.current.clientWidth;
    const scrollAmount = ((direction === "left" ? -1 : 1) * width) / 2;
    const newScrollPos =
      direction === "left"
        ? Math.max(ref.current.scrollLeft - width / 2, 0)
        : Math.min(ref.current.scrollLeft + width / 2, maxLeft);

    ref.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    setScrollPos(newScrollPos);
  };

  useEffect(() => {
    const node = ref.current;
    const scrollListener = debounce(setScrollPos.bind(node.scrollLeft), 50);

    node.addEventListener("scroll", scrollListener);
    return () => node.removeEventListener("scroll", scrollListener);
  }, []);

  useEffect(() => {
    const [left, right] = getButtonVisibility();
    setIsLeftButtonVisible(left);
    setIsRightButtonVisible(right);
  }, [scrollPos]);

  return (
    <View className={cx(css.root, className)}>
      <IconButton
        name="ChevronLeft"
        onClick={() => handleScroll("left")}
        className={cx(css.scrollButton, "left")}
        size="large"
      />

      <View ref={ref} className={cx(css.items, innerClassName)}>
        {children}
      </View>

      <IconButton
        name="ChevronRight"
        onClick={() => handleScroll("right")}
        className={cx(css.scrollButton, "right")}
        size="large"
      />
    </View>
  );
};

const useClasses = makeClasses((_, { isLeftButtonVisible, isRightButtonVisible }) => ({
  items: {
    display: "flex",
    flexFlow: "row nowrap",
    flex: 1,
    overflowX: "auto",
    overflowY: "hidden",
    "& > *:last-child": {
      marginRight: "1rem",
    },
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  root: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
    minWidth: 0,
    overflowX: "auto",
    scrollBehavior: "smooth",
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  scrollButton: {
    margin: "0 0.2rem",
    width: "1rem",
    height: "1rem",
    backgroundColor: colors.blue["800"],
    "&:hover": {
      backgroundColor: colors.blue["700"],
    },
    "& svg": {
      width: "0.6em",
      height: "0.6em",
    },
    "&.left": {
      display: isLeftButtonVisible ? "flex" : "none",
    },
    "&.right": {
      display: isRightButtonVisible ? "flex" : "none",
    },
  },
}));
