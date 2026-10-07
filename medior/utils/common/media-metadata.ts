import { durationRegex, durationToSeconds } from "trabecula/utils/common";

export const getTimestampPairError = (start: number, end: number, duration?: number) => {
  let error: string;

  if (!Number.isFinite(start) || !Number.isFinite(end))
    error = "Timestamps must be finite numbers.";
  else if (start < 0) error = "Start must not be negative.";
  else if (end <= start) error = "End must be greater than start.";
  else if (Number.isFinite(duration) && end > duration) error = "End exceeds the media duration.";

  return error;
};

export const hasTranscription = (transcription?: { text?: string } | null) =>
  Boolean(transcription?.text?.trim());

export const normalizeTimestampPairs = <T extends { order: number }>(pairs: readonly T[]) =>
  [...pairs]
    .sort((a, b) => a.order - b.order)
    .map((pair, index) => ({ ...pair, order: index + 1 }));

export const parseTimestampPairs = (
  pairs: readonly { endDuration: string; order: number; startDuration: string }[],
  duration?: number,
): Array<[number, number]> => {
  const parsed = normalizeTimestampPairs(pairs).map(
    ({ endDuration, startDuration }): [number, number] => {
      if (
        !startDuration.trim() ||
        !endDuration.trim() ||
        !durationRegex.test(startDuration) ||
        !durationRegex.test(endDuration)
      )
        throw new Error("Fix invalid timestamps.");

      return [durationToSeconds(startDuration), durationToSeconds(endDuration)];
    },
  );

  validateTimestampPairs(parsed, duration);

  return parsed;
};

export const validateTimestampPairs = (
  pairs: readonly (readonly [number, number])[],
  duration?: number,
) => {
  if (!pairs?.length) throw new Error("At least one timestamp pair is required.");

  for (const [index, [start, end]] of pairs.entries()) {
    const error = getTimestampPairError(start, end, duration);

    if (error) throw new Error(`Pair ${index + 1}: ${error}`);
  }
};
