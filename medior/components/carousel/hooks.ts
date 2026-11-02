import { MutableRefObject, SyntheticEvent, useEffect, useRef } from "react";

export interface VideoProgress {
  loadedSeconds: number;
  playedSeconds: number;
}

/** Progress is read more often than browsers fire timeupdate, so frames and A-B loops stay precise. */
const PROGRESS_INTERVAL_MS = 100;

/** The video's duration, or the end of its seekable range while the duration is unbounded. */
const getDuration = (video: HTMLVideoElement) =>
  video.duration === Infinity && video.seekable.length > 0
    ? video.seekable.end(video.seekable.length - 1)
    : video.duration;

const getLoadedSeconds = (video: HTMLVideoElement) =>
  video.buffered.length
    ? Math.min(video.buffered.end(video.buffered.length - 1), getDuration(video))
    : 0;

/**
 * Plays and pauses the video with `isPlaying` and applies its volume and playback rate. Once it can
 * play, it reports progress every 100 ms whenever the playback position or buffered length changes.
 */
export const useVideoPlayback = ({
  isPlaying,
  onError,
  onProgress,
  onReady,
  playbackRate,
  videoRef,
  volume,
}: {
  isPlaying: boolean;
  onError: (error: Error) => void;
  onProgress: (progress: VideoProgress) => void;
  onReady: (video: HTMLVideoElement) => void;
  playbackRate: number;
  videoRef: MutableRefObject<HTMLVideoElement>;
  volume: number;
}) => {
  const progressHandler = useRef(onProgress);
  const readyVideo = useRef<HTMLVideoElement>(null);

  progressHandler.current = onProgress;

  const play = (video: HTMLVideoElement) => video.play().catch(onError);

  useEffect(() => {
    let previous: VideoProgress & { video: HTMLVideoElement } = null;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video !== readyVideo.current || !getDuration(video)) return;

      const progress = { loadedSeconds: getLoadedSeconds(video), playedSeconds: video.currentTime };

      if (
        video !== previous?.video ||
        progress.playedSeconds !== previous.playedSeconds ||
        progress.loadedSeconds !== previous.loadedSeconds
      )
        progressHandler.current(progress);

      previous = { ...progress, video };
    }, PROGRESS_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) play(video);
    else video.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const handleCanPlay = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;

    readyVideo.current = video;
    onReady(video);
    video.volume = volume;
    video.playbackRate = playbackRate;

    if (isPlaying) play(video);
  };

  return { handleCanPlay };
};
