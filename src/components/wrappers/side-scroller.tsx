import { cloneElement, useEffect, useRef, useState } from "react";
import { colors } from "@mui/material";
import { IconButton, View } from "components";
import { debounce, makeClasses, useElementResize } from "utils";

interface SideScrollerProps {
  children: JSX.Element;
  className?: string;
}

const SideScroller = ({ children, className }: SideScrollerProps) => {
  const ref = useRef(null);
  useElementResize(ref);

  const [scrollPos, setScrollPos] = useState(0);

  useEffect(() => {
    const node = ref.current;
    const scrollListener = debounce(setScrollPos.bind(node.scrollLeft), 50);

    node.addEventListener("scroll", scrollListener);
    return () => node.removeEventListener("scroll", scrollListener);
  }, []);

  const handleScroll = (direction: "left" | "right") => {
    const node = ref?.current;
    if (!node) return false;

    node.scrollLeft += direction === "left" ? -200 : 200;
    setScrollPos(node.scrollLeft);
  };

  const getButtonVisibility = () => {
    const node = ref?.current;
    if (!node) return [false, false];

    const { clientWidth, scrollWidth, scrollLeft } = node;
    if (!(clientWidth < scrollWidth)) return [false, false];
    return [scrollLeft > 0, clientWidth + scrollLeft < scrollWidth];
  };

  const [isLeftButtonVisible, setIsLeftButtonVisible] = useState(false);
  const [isRightButtonVisible, setIsRightButtonVisible] = useState(false);

  useEffect(() => {
    const [left, right] = getButtonVisibility();
    setIsLeftButtonVisible(left);
    setIsRightButtonVisible(right);
  }, [scrollPos]);

  const { classes: css, cx } = useClasses({ isLeftButtonVisible, isRightButtonVisible });

  return (
    <View className={cx(className, css.root)}>
      <IconButton
        name="ChevronLeft"
        onClick={() => handleScroll("left")}
        className={cx(css.scrollButton, "left")}
        size="large"
      />

      {cloneElement(children, { ref, className: cx(children.props.className, "side-scroller") })}

      <IconButton
        name="ChevronRight"
        onClick={() => handleScroll("right")}
        className={cx(css.scrollButton, "right")}
        size="large"
      />
    </View>
  );
};

export default SideScroller;

const useClasses = makeClasses((_, { isLeftButtonVisible, isRightButtonVisible }) => ({
  items: {
    display: "flex",
    flexFlow: "row nowrap",
  },
  root: {
    display: "flex",
    flexFlow: "row nowrap",
    alignItems: "center",
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
