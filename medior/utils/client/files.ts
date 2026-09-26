import { promises as fs } from "fs";
import path from "path";
import { Metadata } from "sharp";
import { makePerfLog } from "trabecula/utils/server";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import { CONSTANTS, dayjs } from "medior/utils/common";
import { analyzeAudio, getIsAnimated, getNtfsFileIdentity } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { getVideoInfo, vidToThumbGrid } from "medior/utils/server/videos";
import { workSignal } from "medior/utils/server/work-signal";

export const genFileInfo = async (args: {
  file?: FileSchema;
  filePath: string;
  hash: string;
  imageInfo?: Pick<Metadata, "height" | "width">;
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

  const ext = args.filePath.split(".").pop().toLowerCase();
  const isAnimated = getIsAnimated(ext);

  let isCorrupted: boolean = false;
  let imageInfo: Pick<Metadata, "height" | "width"> = args.imageInfo ?? null;

  args.onProgress?.("Reading file metadata.");

  const stats = await fs.stat(args?.filePath);

  if (!isAnimated && !imageInfo && args.skipThumbs) {
    try {
      imageInfo = (
        await runImageTask({ input: args.filePath, options: { failOn: "none" } }, args.signal)
      ).metadata;
    } catch (err) {
      isCorrupted = true;
    }
  }

  if (isAnimated) args.onProgress?.("Inspecting video metadata.");

  const videoInfo = isAnimated ? await getVideoInfo(args.filePath, args.signal) : null;

  args.signal?.throwIfAborted();

  const audioAnalysis =
    !args.skipAudio && videoInfo?.audioCodec && videoInfo.audioCodec !== "None"
      ? await analyzeAudio(args.filePath, args.onProgress, args.signal, {
          withTranscription: args.withTranscription,
          withWaveform: args.withWaveform,
        })
      : null;

  const audioBitrate = isAnimated ? videoInfo.audioBitrate : null;
  const audioCodec = isAnimated ? videoInfo.audioCodec : null;
  const bitrate = isAnimated ? videoInfo.bitrate : null;

  const dateModified =
    !args.file || dayjs(stats.mtime).isAfter(args.file?.dateModified)
      ? stats.mtime.toISOString()
      : args.file?.dateModified;

  const duration = isAnimated ? videoInfo?.duration : null;
  const frameRate = isAnimated ? videoInfo?.frameRate : null;
  const videoCodec = isAnimated ? videoInfo?.videoCodec : null;

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
        args.signal,
      );

      isCorrupted = thumbGridRes.isCorrupted;
      thumbPath = thumbGridRes.path;
    } else {
      try {
        const result = await runImageTask(
          {
            input: args.filePath,
            options: { failOn: "none" },
            outputPath: thumbPath,
            resize: { height: CONSTANTS.FILE.THUMB.MAX_DIM },
          },
          args.signal,
        );

        imageInfo ??= result.metadata;
      } catch {
        isCorrupted = true;
      }
    }

    args.signal?.throwIfAborted();

    if (DEBUG) perfLog(`Generated thumbnail.`);
  }

  const width = isAnimated ? videoInfo?.width : imageInfo?.width;
  const height = isAnimated ? videoInfo?.height : imageInfo?.height;

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
    hasTranscript: Boolean(audioAnalysis?.transcription ?? args.file?.transcription),
    height,
    isCorrupted,
    peakDecibels: audioAnalysis?.peakDecibels,
    size: stats.size,
    thumb: {
      frameHeight: isAnimated ? height : null,
      frameWidth: isAnimated ? width : null,
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
export const isGeneratedMediaUnreadable = (info: Pick<ImportFileInput, "ext" | "isCorrupted">) =>
  info.isCorrupted && !getIsAnimated(info.ext);
