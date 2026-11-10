import { promises as fs } from "fs";
import path from "path";
import { makePerfLog } from "trabecula/utils/server";
import type { FileSchema, ImportFileInput } from "medior/server/database";
import {
  CONSTANTS,
  dayjs,
  hasTranscription,
  MusicImportOptions,
  parseFileMusic,
} from "medior/utils/common";
import {
  analyzeAudio,
  getConfig,
  getDerivedMediaFolder,
  getIsAnimated,
  getIsAudio,
  getNtfsFileIdentity,
  NtfsFileIdentity,
} from "medior/utils/server";
import { readId3Rating } from "medior/utils/server/id3";
import { runImageTask } from "medior/utils/server/image-task";
import { audioToThumb, getMediaInfo, vidToThumbGrid } from "medior/utils/server/videos";
import { workSignal } from "medior/utils/server/work-signal";

export const genFileInfo = async (args: {
  file?: FileSchema;
  filePath: string;
  hash: string;
  /**
   * How an imported audio file is read into Music, which leaves it out without them. Refreshes
   * read a file with those it was imported with.
   */
  musicOptions?: MusicImportOptions | null;
  onProgress?: (message: string, progress?: number) => void;
  /**
   * The name the file is imported under, which the Music options may read a missing artist and
   * title from. Refreshes use the file's own.
   */
  originalName?: string;
  /** Runs thumbnail generation, such as once a limit on concurrent ffmpeg work allows it. */
  runThumbs?: (run: () => Promise<void>) => Promise<void>;
  signal?: AbortSignal;
  skipAudio?: boolean;
  skipThumbs?: boolean;
  thumbId?: string;
  /**
   * Reads the rating a player saved in an audio file's ID3 tag, for files without a rating in
   * Medior.
   */
  withTagRating?: boolean;
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
  // Imports bring their Music options, and refreshes reuse those the file was imported with.
  const musicOptions = info.musicTags
    ? (args.musicOptions ?? args.file?.musicOptions ?? null)
    : undefined;

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

  const isAudio = getIsAudio(ext);
  const hasFrames = duration > 0 && !isAudio;
  // Thumbnails go beside the media, or into storage for linked media.
  const dirPath = getDerivedMediaFolder(args.filePath, args.hash);
  let thumbPath = path.resolve(dirPath, `${args.thumbId ?? args.hash}-thumb.jpg`);

  const tagRating =
    args.withTagRating && isAudio && !(args.file?.rating > 0)
      ? await readId3Rating(args.filePath)
      : null;

  const generateThumb = async () => {
    args.onProgress?.("Generating thumbnail.");

    await fs.mkdir(dirPath, { recursive: true });

    if (isAudio) {
      try {
        await audioToThumb(args.filePath, thumbPath, info.hasCover, args.signal);
      } catch {
        args.signal?.throwIfAborted();
        isCorrupted = true;
      }
    } else if (hasFrames) {
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
  };

  if (!args.skipThumbs) {
    args.signal?.throwIfAborted();

    if (args.runThumbs) await args.runThumbs(generateThumb);
    else await generateThumb();

    args.signal?.throwIfAborted();

    if (DEBUG) perfLog(`Generated thumbnail.`);
  }

  let thumbNtfsIdentity: NtfsFileIdentity = null;

  try {
    thumbNtfsIdentity = await getNtfsFileIdentity(thumbPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

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
    music:
      musicOptions &&
      parseFileMusic({
        fileName: args.originalName ?? args.file?.originalName,
        hasCover: info.hasCover,
        options: musicOptions,
        settings: getConfig().music,
        tagSets: info.musicTags,
      }),
    musicOptions,
    peakDecibels: audioAnalysis?.peakDecibels,
    rating: tagRating ?? undefined,
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
