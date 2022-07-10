import { cloneElement, useEffect, useRef, useState } from "react";
import { colors } from "@mui/material";
import { IconButton } from "components";
import { debounce, makeClasses, useElementResize } from "utils";
interface SideScrollerProps {
  children: any;
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

  const handleScroll = (direction) => {
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
    <div className={cx(className, css.container)}>
      <IconButton
        name="ChevronLeft"
        onClick={() => handleScroll("left")}
        className={cx(css.scrollButton, "left")}
        size="large"
      />

      {children &&
        cloneElement(children, {
          ref,
          className: `${children.props.className ?? ""} side-scroller`,
        })}

      <IconButton
        name="ChevronRight"
        onClick={() => handleScroll("right")}
        className={cx(css.scrollButton, "right")}
        size="large"
      />
    </div>
  );
};

export default SideScroller;

const useClasses = makeClasses((_, { isLeftButtonVisible, isRightButtonVisible }) => ({
  container: {
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
