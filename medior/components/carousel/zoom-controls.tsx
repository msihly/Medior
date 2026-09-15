import { MutableRefObject } from "react";
import { PanzoomObject } from "@panzoom/panzoom";
import { IconButton } from "medior/components";
import { zoomScaleStepIn, zoomScaleStepOut } from "medior/utils/server";

interface ZoomControlsProps {
  disabled?: boolean;
  panZoomRef: MutableRefObject<PanzoomObject>;
}

export const ZoomControls = ({ disabled, panZoomRef }: ZoomControlsProps) => {
  const zoomIn = () => {
    if (panZoomRef.current) panZoomRef.current.zoom(zoomScaleStepIn(panZoomRef.current.getScale()));
  };

  const zoomOut = () => {
    if (panZoomRef.current)
      panZoomRef.current.zoom(zoomScaleStepOut(panZoomRef.current.getScale()));
  };

  const zoomReset = () => {
    panZoomRef.current?.reset();
    panZoomRef.current?.resetStyle();
  };

  return (
    <>
      <IconButton name="Replay" onClick={zoomReset} tooltip="Reset Zoom" disabled={disabled} />

      <IconButton name="ZoomOut" onClick={zoomOut} tooltip="Zoom Out" disabled={disabled} />

      <IconButton name="ZoomIn" onClick={zoomIn} tooltip="Zoom In" disabled={disabled} />
    </>
  );
};
