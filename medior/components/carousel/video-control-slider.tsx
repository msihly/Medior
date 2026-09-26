import { useEffect, useRef, useState } from "react";
import { Slider } from "@mui/material";
import { View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export const CustomSlider = (props: {
  children: JSX.Element;
  disabled?: boolean;
  max: number;
  min: number;
  onChange: (event: any, value: number) => void;
  onChangeCommitted?: () => void;
  step: number;
  value: number;
}) => {
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
          onChange={props?.onChange}
          onChangeCommitted={props?.onChangeCommitted}
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
    "& .MuiSlider-markLabel": {
      fontSize: "0.65em",
      fontWeight: 600,
      top: -10,
    },
    "& .MuiSlider-thumb": {
      borderRadius: "0.5rem",
      height: 4,
      width: 18,
    },
    color: colors.custom.lightBlue,
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
