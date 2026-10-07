import { useEffect, useRef, useState } from "react";
import { Slider, SliderProps, View } from "medior/components";
import { makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

interface CustomSliderProps
  extends Pick<
    SliderProps,
    "disabled" | "max" | "min" | "onCommit" | "setValue" | "step" | "value"
  > {
  children: JSX.Element;
}

export const CustomSlider = (props: CustomSliderProps) => {
  const { css } = useClasses(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = () => setIsDragging(true);

  const handleMouseUp = () => setIsDragging(false);

  const handleMouseEnter = () => setIsVisible(true);

  const handleMouseLeave = () => !isDragging && setIsVisible(false);

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseUp = (event: MouseEvent) => {
      setIsDragging(false);

      if (!rootRef.current?.contains(event.target as Node)) setIsVisible(false);
    };

    window.addEventListener("mouseup", handleWindowMouseUp, { once: true });

    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [isDragging]);

  return (
    <View
      ref={rootRef}
      column
      justify="center"
      height="100%"
      onMouseLeave={handleMouseLeave}
      padding={{ bottom: "1rem", top: "1rem" }}
    >
      <View onMouseEnter={handleMouseEnter}>{props.children}</View>

      <View display={isVisible ? "block" : "none"} className={css.sliderContainer}>
        <Slider
          value={props?.value}
          setValue={props?.setValue}
          onCommit={props?.onCommit}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          disabled={props?.disabled}
          min={props?.min}
          max={props?.max}
          step={props?.step}
          orientation="vertical"
          valueLabelDisplay="off"
          className={css.slider}
        />
      </View>
    </View>
  );
};

const useClasses = makeClasses({
  slider: {
    marginBottom: "0 !important",
  },
  sliderContainer: {
    backgroundColor: "rgb(0, 0, 0, 0.5)",
    borderRadius: "0.5rem 0.5rem 0 0",
    bottom: CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT,
    height: "8rem",
    padding: "0.8rem 0.3rem 0",
    position: "absolute",
  },
});
