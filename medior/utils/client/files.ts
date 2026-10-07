import { promises as fs } from "fs";
import path from "path";
import { makePerfLog } from "trabecula/utils/server";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import { CONSTANTS, dayjs, hasTranscription } from "medior/utils/common";
import { analyzeAudio, getIsAnimated, getNtfsFileIdentity } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { getMediaInfo, vidToThumbGrid } from "medior/utils/server/videos";
import { workSignal } from "medior/utils/server/work-signal";

export const genFileInfo = async (args: {
  file?: FileSchema;
  filePath: string;
  hash: string;
  onProgress?: (message: string, progress?: number) => void;
  signal?: AbortSignal;
  skipAudio?: boolean;
  skipThumbs?: boolean;
  thumbId?: string;
  withTranscription?: boolean;
  withWaveform?: boolean;
}) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("[genFileInfo]");

  args = { ...args, signal: args.signal ?? workSignal.getStore() };

  args.signal?.throwIfAborted();

  let isCorrupted: boolean = false;

  args.onProgress?.("Reading file metadata.");

  const stats = await fs.stat(args?.filePath);
  const info = await getMediaInfo(args.filePath, args.signal);
  const { audioBitrate, audioCodec, bitrate, duration, ext, frameRate, height, videoCodec, width } =
    info;

  args.signal?.throwIfAborted();

  const audioAnalysis =
    !args.skipAudio && audioCodec && audioCodec !== "None"
      ? await analyzeAudio(args.filePath, args.onProgress, args.signal, {
          withTranscription: args.withTranscription,
          withWaveform: args.withWaveform,
        })
      : null;

  const dateModified =
    !args.file || dayjs(stats.mtime).isAfter(args.file?.dateModified)
      ? stats.mtime.toISOString()
      : args.file?.dateModified;

  if (DEBUG) perfLog(`Got file info.`);

  const hasFrames = duration > 0;
  const dirPath = path.dirname(args.filePath);
  let thumbPath = path.resolve(dirPath, `${args.thumbId ?? args.hash}-thumb.jpg`);

  if (!args.skipThumbs) {
    args.signal?.throwIfAborted();
    args.onProgress?.("Generating thumbnail.");

    if (hasFrames) {
      const thumbGridRes = await vidToThumbGrid(
        args.filePath,
        dirPath,
        args.thumbId ?? args.hash,
        info,
        args.signal,
      );

      isCorrupted = thumbGridRes.isCorrupted;
      thumbPath = thumbGridRes.path;
    } else {
      try {
        await runImageTask(
          {
            input: args.filePath,
            options: { failOn: "none" },
            outputPath: thumbPath,
            resize: { height: CONSTANTS.FILE.THUMB.MAX_DIM },
          },
          args.signal,
        );
      } catch {
        isCorrupted = true;
      }
    }

    args.signal?.throwIfAborted();

    if (DEBUG) perfLog(`Generated thumbnail.`);
  }

  const thumbNtfsIdentity = await getNtfsFileIdentity(thumbPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;

    return null;
  });

  const fileInfo: Partial<ImportFileInput> = {
    audioBitrate,
    audioCodec,
    bitrate,
    dateModified,
    duration,
    ext,
    frameRate,
    hash: args?.hash,
    hasTranscript: hasTranscription(audioAnalysis?.transcription ?? args.file?.transcription),
    height,
    isCorrupted,
    peakDecibels: audioAnalysis?.peakDecibels,
    size: stats.size,
    thumb: {
      frameHeight: hasFrames ? height : null,
      frameWidth: hasFrames ? width : null,
      ntfsFileId: thumbNtfsIdentity?.fileId,
      ntfsVolumeId: thumbNtfsIdentity?.volumeId,
      path: thumbPath,
    },
    transcription: audioAnalysis?.transcription,
    videoCodec,
    waveformPeaks: audioAnalysis?.waveformPeaks,
    width,
  };

  if (DEBUG) perfLogTotal(`Generated file info: ${JSON.stringify(fileInfo)}.`);

  return fileInfo as ImportFileInput;
};

/** Missing video frames retain their corruption flag when the thumbnail grid is readable. */
export const isGeneratedMediaUnreadable = (
  info: Pick<ImportFileInput, "duration" | "ext" | "isCorrupted">,
) => info.isCorrupted && !(info.duration > 0 || getIsAnimated(info.ext));
