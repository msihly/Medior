/** Seeks to a fraction of the video's duration, skipping the seek while the duration is unknown. */
export const seekToFraction = (video: HTMLVideoElement, fraction: number) => {
  if (video?.duration) video.currentTime = fraction * video.duration;
};
