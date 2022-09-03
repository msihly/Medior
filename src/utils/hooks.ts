import { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { FixedSizeList } from "react-window";

interface UseDragScrollProps {
  momentum?: number;
  listRef: MutableRefObject<FixedSizeList<any>>;
  listOuterRef: MutableRefObject<any>;
  screenWidth: number;
  scrollLeft: MutableRefObject<number>;
}

export const useDragScroll = ({
  listRef,
  listOuterRef,
  momentum = 0.8,
  screenWidth,
  scrollLeft,
}: UseDragScrollProps) => {
  const dragDirection = useRef<"left" | "right">(null);
  const initialMouseX = useRef(null);
  const momentumId = useRef(null);
  const scrollFinal = useRef(0);
  const scrollStart = useRef(0);
  const velocity = useRef(0);

  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (event: React.MouseEvent) => {
    if (!listRef.current) return;

    initialMouseX.current = event.clientX;
    scrollStart.current = scrollLeft.current;
    // console.debug("ScrollStart:", scrollStart.current);
    cancelMomentumTracking();

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
  };

  const mouseMoveHandler = (event: MouseEvent) => {
    if (!listRef.current) return;

    const walk = (event.clientX - initialMouseX.current) * 3;
    const newScrollLeft = scrollStart.current - walk;
    const isScrollValid = validateScrollLeft(newScrollLeft);

    // console.debug("MouseMove left:", newScrollLeft, "isScrollValid:", isScrollValid);
    if (!isScrollValid) return;
    listRef.current.scrollTo(newScrollLeft);

    velocity.current = newScrollLeft - scrollStart.current;
    dragDirection.current = velocity.current > 0 ? "left" : "right";

    if (velocity.current > 0 && !isDragging) setIsDragging(true);
  };

  const mouseUpHandler = () => {
    scrollFinal.current = scrollLeft.current;
    // console.debug("ScrollFinal:", scrollFinal.current);

    if (Math.abs(scrollFinal.current - scrollStart.current) > 5) {
      velocity.current =
        Math.max(Math.abs(velocity.current), 30) * (dragDirection.current === "right" ? -1 : 1);

      beginMomentumTracking();
    }

    setTimeout(() => setIsDragging(false), 0);
    document.removeEventListener("mousemove", mouseMoveHandler);
    document.removeEventListener("mouseup", mouseUpHandler);
  };

  const validateScrollLeft = (newScrollLeft: number) =>
    newScrollLeft >= 0 && newScrollLeft <= listOuterRef.current?.scrollWidth - screenWidth * 0.8;

  /* ---------------------------- BEGIN - MOMENTUM ---------------------------- */
  const beginMomentumTracking = () => {
    cancelMomentumTracking();
    momentumId.current = requestAnimationFrame(momentumLoop);
  };

  const cancelMomentumTracking = () => cancelAnimationFrame(momentumId.current);

  const momentumLoop = () => {
    const newScrollLeft = scrollLeft.current + velocity.current;
    const isScrollValid = validateScrollLeft(newScrollLeft);
    // console.debug("Momentum left:", newScrollLeft, "isScrollValid:", isScrollValid);

    if (!isScrollValid) return;
    listRef.current.scrollTo(newScrollLeft);
    velocity.current *= momentum;

    if (Math.abs(velocity.current) > 0.5) momentumId.current = requestAnimationFrame(momentumLoop);
  };
  /* ----------------------------- END - MOMENTUM ----------------------------- */

  return { handleMouseDown, isDragging };
};

export const useElementResize = (ref: MutableRefObject<any>, condition?: any) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [absPosition, setAbsPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const nodeRef = ref?.current;
    if (!nodeRef) return;

    const getDimensions = () => ({
      width: nodeRef.offsetWidth,
      height: nodeRef.offsetHeight,
    });

    const getPosition = () => {
      const rect = nodeRef.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    };

    const handleResize = () => {
      setDimensions(getDimensions());
      setAbsPosition(getPosition());
    };

    if (nodeRef) handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [ref, condition]);

  return { ...dimensions, ...absPosition };
};

export const useForceUpdate = () => {
  const [, setTick] = useState(0);
  const update = useCallback(() => setTick((tick) => tick + 1), []);
  return update;
};
