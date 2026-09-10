import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { Comp, View } from "medior/components";
import { colors, makeClasses, toast } from "medior/utils/client";

export interface VideoWaveformProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  peaks: number[];
}

const renderWaveform = (
  channels: (Float32Array | number[])[],
  context: CanvasRenderingContext2D,
) => {
  const { height, width } = context.canvas;
  const peaks = channels[0];
  if (!peaks.length) return;

  const peakMaximum = Math.max(...Array.from(peaks, (peak) => Math.abs(peak)), Number.EPSILON);
  const points = Array.from(peaks, (peak, index) => ({
    x: (index / Math.max(peaks.length - 1, 1)) * width,
    y: height - (Math.abs(peak) / peakMaximum) * (height - 2),
  }));
  const line = new Path2D();

  line.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    line.quadraticCurveTo(
      previous.x,
      previous.y,
      (previous.x + point.x) / 2,
      (previous.y + point.y) / 2,
    );
  }
  line.lineTo(points[points.length - 1].x, points[points.length - 1].y);

  const area = new Path2D(line);
  area.lineTo(width, height);
  area.lineTo(0, height);
  area.closePath();

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(245, 245, 245, 0.5)");
  gradient.addColorStop(1, "rgba(245, 245, 245, 0)");
  context.fillStyle = gradient;
  context.fill(area);
  context.lineWidth = 2;
  context.strokeStyle = colors.custom.white;
  context.stroke(line);
};

export const VideoWaveform = Comp(
  ({ currentTime, duration, onSeek, peaks }: VideoWaveformProps) => {
    const { css } = useClasses(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const waveformRef = useRef<WaveSurfer>(null);

    useEffect(() => {
      if (!containerRef.current || !duration || !peaks?.length) return;
      waveformRef.current = WaveSurfer.create({
        container: containerRef.current,
        cursorWidth: 0,
        duration,
        height: 48,
        interact: true,
        normalize: true,
        peaks: [[...peaks]],
        progressColor: colors.custom.lightBlue,
        renderFunction: renderWaveform,
        waveColor: colors.custom.white,
      });
      const handleError = (error: Error) =>
        toast.error(`Unable to render waveform: ${error.message}`);
      const unsubscribeError = waveformRef.current.on("error", handleError);
      const unsubscribe = waveformRef.current.on("interaction", onSeek);
      return () => {
        unsubscribe();
        unsubscribeError();
        waveformRef.current?.destroy();
        waveformRef.current = null;
      };
    }, [duration, onSeek, peaks]);

    useEffect(() => {
      waveformRef.current?.setTime(currentTime);
    }, [currentTime]);

    if (!peaks?.length) return null;
    return <View ref={containerRef} className={css.root} />;
  },
);

const useClasses = makeClasses({
  root: {
    position: "absolute",
    right: 0,
    bottom: "100%",
    left: 0,
    height: "3rem",
    cursor: "pointer",
  },
});
