import React, { cloneElement, useEffect, useRef, useState } from "react";
import { colors } from "@mui/material";
import { makeStyles } from "utils";
import { IconButton } from "components/buttons";
import { debounce, makeClassName } from "utils";
import { useElementResize } from "utils/hooks";

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
    if (!node) return { left: false, right: false };

    const { clientWidth, scrollWidth, scrollLeft } = node;
    if (!(clientWidth < scrollWidth)) return { left: false, right: false };
    return { left: scrollLeft > 0, right: clientWidth + scrollLeft < scrollWidth };
  };

  const [buttonVisibility, setButtonVisibility] = useState({ left: false, right: false });
  useEffect(() => setButtonVisibility(getButtonVisibility()), [scrollPos]);

  const { classes: css } = useClasses({ buttonVisibility });

  return (
    <div className={makeClassName(className, css.container)}>
      <IconButton
        name="ChevronLeft"
        onClick={() => handleScroll("left")}
        className={makeClassName(css.scrollButton, "left")}
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
        className={makeClassName(css.scrollButton, "right")}
        size="large"
      />
    </div>
  );
};

export default SideScroller;

const useClasses = makeStyles<object>()((_, { buttonVisibility }: any) => ({
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
      display: buttonVisibility?.left ? "flex" : "none",
    },
    "&.right": {
      display: buttonVisibility?.right ? "flex" : "none",
    },
  },
}));
