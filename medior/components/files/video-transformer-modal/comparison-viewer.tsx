import { useEffect, useRef, useState } from "react";
import { Slider } from "@mui/material";
import Panzoom, { PanzoomObject } from "@panzoom/panzoom";
import { Button, Comp, LoadingOverlay, Modal, Text, View, ZoomControls } from "medior/components";
import { FileTransform } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { getIsAnimated } from "medior/utils/server";
import { loadComparisonFrame } from "medior/utils/server/comparison-frame";

interface ComparisonViewerProps {
  onClose: () => void;
  outputLabel?: string;
  outputPath?: string;
  transform: FileTransform;
}

export const ComparisonViewer = Comp(
  ({ onClose, outputLabel = "Re-encoded", outputPath, transform }: ComparisonViewerProps) => {
    const [error, setError] = useState("");
    const [frames, setFrames] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [position, setPosition] = useState(50);
    const [selectedTime, setSelectedTime] = useState(0);
    const [time, setTime] = useState(0);
    const originalRef = useRef<HTMLImageElement>(null);
    const outputRef = useRef<HTMLImageElement>(null);
    const panZoomRef = useRef<PanzoomObject>(null);
    const { css } = useClasses(null);
    const duration = Math.max(
      0,
      Math.min(transform.beforeDuration || 0, transform.afterDuration || 0) -
        1 / Math.min(transform.beforeFrameRate || 30, transform.afterFrameRate || 30),
    );

    useEffect(() => {
      if (frames.length !== 2) return;
      const original = originalRef.current;
      const output = outputRef.current;
      const syncZoom = () => {
        original.style.transform = output.style.transform;
        original.style.transition = output.style.transition;
      };
      output.addEventListener("panzoomchange", syncZoom);
      panZoomRef.current = Panzoom(output, {
        animate: true,
        contain: "outside",
        cursor: "grab",
        maxScale: CONSTANTS.CAROUSEL.ZOOM.MAX_SCALE,
        minScale: CONSTANTS.CAROUSEL.ZOOM.MIN_SCALE,
        panOnlyWhenZoomed: true,
        step: CONSTANTS.CAROUSEL.ZOOM.STEP,
      });
      return () => {
        output.removeEventListener("panzoomchange", syncZoom);
        panZoomRef.current?.destroy();
        panZoomRef.current = null;
      };
    }, [frames.length]);

    useEffect(() => {
      const controller = new AbortController();
      setError("");
      setIsLoading(true);
      Promise.all([
        loadComparisonFrame(
          transform.beforePath,
          time,
          getIsAnimated(transform.beforeExt),
          controller.signal,
        ),
        loadComparisonFrame(
          outputPath ?? transform.afterPath,
          time,
          getIsAnimated(transform.afterExt),
          controller.signal,
        ),
      ])
        .then((result) => {
          if (!controller.signal.aborted) {
            setFrames(result);
            setIsLoading(false);
          }
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted) {
            setFrames([]);
            setError(`Unable to compare these files: ${err.message}`);
            setIsLoading(false);
            controller.abort();
          }
        });
      return () => controller.abort();
    }, [
      outputPath,
      transform.afterExt,
      transform.afterPath,
      transform.beforeExt,
      transform.beforePath,
      time,
    ]);

    const handlePositionChange = (_event: unknown, value: number | number[]) =>
      setPosition(value as number);

    const handleTimeChange = (_event: unknown, value: number | number[]) =>
      setSelectedTime(value as number);

    const handleTimeCommit = (_event: unknown, value: number | number[]) =>
      setTime(value as number);

    return (
      <Modal.Container height="100%" width="100%" onClose={onClose}>
        <Modal.Header>
          <Text preset="title">{"Compare Media"}</Text>
        </Modal.Header>

        <Modal.Content dividers={false} overflow="hidden">
          <View row align="center" flex="none" padding={{ top: "0.3rem", bottom: "0.3rem" }}>
            <View row flex={1} align="center" justify="center">
              <Text fontWeight={600}>{"Original"}</Text>
            </View>

            <View row flex="none" spacing="0.3rem">
              <ZoomControls panZoomRef={panZoomRef} disabled={isLoading || frames.length !== 2} />
            </View>

            <View row flex={1} align="center" justify="center">
              <Text fontWeight={600}>{outputLabel}</Text>
            </View>
          </View>

          <View flex={1} className={css.surface}>
            <LoadingOverlay isLoading={isLoading} />

            {error ? (
              <Text color={colors.custom.red}>{error}</Text>
            ) : frames.length === 2 ? (
              <>
                <img
                  ref={outputRef}
                  className={css.image}
                  src={frames[1]}
                  alt={outputLabel}
                  draggable={false}
                />

                <View
                  className={css.original}
                  style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                >
                  <img
                    ref={originalRef}
                    className={css.image}
                    src={frames[0]}
                    alt="Original"
                    draggable={false}
                  />
                </View>

                <Slider
                  className={css.divider}
                  value={position}
                  onChange={handlePositionChange}
                  slotProps={{ input: { title: "Original / re-encoded comparison" } }}
                />
              </>
            ) : null}
          </View>

          {transform.isAnimated && duration > 0 && (
            <View
              row
              align="center"
              spacing="1rem"
              flex="none"
              padding={{ left: "1rem", right: "1rem" }}
            >
              <Text whiteSpace="nowrap">{`Time: ${selectedTime.toFixed(2)}s`}</Text>

              <Slider
                max={duration}
                step={0.01}
                value={selectedTime}
                onChange={handleTimeChange}
                onChangeCommitted={handleTimeCommit}
                slotProps={{ input: { title: "Comparison time" } }}
              />
            </View>
          )}
        </Modal.Content>

        <Modal.Footer>
          <Button text="Close" icon="Close" onClick={onClose} />
        </Modal.Footer>
      </Modal.Container>
    );
  },
);

const useClasses = makeClasses(() => ({
  divider: {
    height: "100%",
    left: 0,
    padding: "0 !important",
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    "& .MuiSlider-rail, & .MuiSlider-track": { display: "none" },
    "& .MuiSlider-thumb": {
      borderRadius: 0,
      boxShadow: "0 0 3px black",
      color: "white",
      cursor: "ew-resize",
      height: "100%",
      pointerEvents: "auto",
      width: 2,
      "&::after": {
        backgroundColor: colors.background,
        border: "2px solid white",
        borderRadius: "50%",
        content: '"↔"',
        display: "grid",
        height: 32,
        placeItems: "center",
        width: 32,
      },
    },
  },
  image: {
    backgroundColor: colors.custom.black,
    height: "100%",
    inset: 0,
    objectFit: "contain",
    position: "absolute",
    userSelect: "none",
    width: "100%",
  },
  original: {
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
  },
  surface: {
    alignItems: "center",
    backgroundColor: colors.custom.black,
    borderRadius: "0.5rem",
    justifyContent: "center",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
}));
