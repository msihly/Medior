import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { parseWebVtt, SubtitleSource } from "medior/utils/common";

export interface SubtitleStream {
  codec: string;
  index: number;
  label?: string;
  lang?: string;
}

/** Subtitle codecs written per container. Matroska copies text and VobSub tracks as they are. */
const EMBED_SUBTITLE_CODECS: Record<string, string> = {
  m4v: "mov_text",
  mkv: "copy",
  mov: "mov_text",
  mp4: "mov_text",
  webm: "webvtt",
};

/** `isStrict` also fails on logged errors, which ffmpeg reports for dropped cues without failing. */
const runCommand = (command: string, args: string[], signal?: AbortSignal, isStrict = false) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 64 * 1024 * 1024, signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error && !(isStrict && stderr?.trim())) resolve(stdout);
        else if (signal?.aborted || !stderr?.trim()) reject(error);
        else reject(new Error(stderr.trim()));
      },
    );
  });

/**
 * Matroska copies tracks as they are, which frame-based MicroDVD .sub text can't be; other
 * containers convert text but can't hold VobSub images.
 */
export const canEmbedSubtitle = (videoExt: string, subtitlePath: string) => {
  const codec = EMBED_SUBTITLE_CODECS[videoExt.toLowerCase()];
  const ext = path.extname(subtitlePath).toLowerCase();

  return codec === "copy" ? ext !== ".sub" : !!codec && ext !== ".idx";
};

/** Where ffmpeg writes a remux until it finishes, keeping the output's extension for its format. */
export const getPartialMuxPath = (outputPath: string) => {
  const { dir, ext, name } = path.parse(outputPath);

  return path.join(dir, `${name}.partial${ext}`);
};

/** Remuxes the video with each subtitle as an added track, keeping every existing stream. */
export const muxSubtitles = async ({
  inputPath,
  outputPath,
  signal,
  subtitles,
}: {
  inputPath: string;
  outputPath: string;
  signal?: AbortSignal;
  subtitles: SubtitleSource[];
}) => {
  const ext = path.extname(outputPath).slice(1).toLowerCase();
  const codec = EMBED_SUBTITLE_CODECS[ext];

  if (!codec) throw new Error(`Subtitles cannot be embedded in .${ext} files`);

  const args = ["-v", "error", "-nostdin", "-y", "-i", inputPath];

  for (const subtitle of subtitles) args.push("-i", subtitle.path);

  args.push("-map", "0:v", "-map", "0:a?", "-map", "0:s?");

  if (ext === "mkv") args.push("-map", "0:t?");

  // VobSub inputs hold a stream per language.
  subtitles.forEach((_, index) => args.push("-map", `${index + 1}:s`));
  args.push("-c", "copy", "-c:s", codec);

  const partialPath = getPartialMuxPath(outputPath);

  // Bit-exact muxing lets an interrupted import recreate the same output and checksum.
  args.push("-fflags", "+bitexact", partialPath);

  await runCommand(process.env.FFMPEG_PATH || "ffmpeg", args, signal, true);

  // Every added subtitle must be a track before its source can be deleted with the import.
  const [inputStreams, outputStreams] = await Promise.all([
    probeSubtitleStreams(inputPath, signal),
    probeSubtitleStreams(partialPath, signal),
  ]);

  if (outputStreams.length < inputStreams.length + subtitles.length) {
    await fs.rm(partialPath, { force: true });

    throw new Error("Embedding subtitles dropped a track; the source was retained");
  }

  // Only finished output takes the final name, so a killed ffmpeg never leaves it truncated.
  await fs.rename(partialPath, outputPath);
};

export const probeSubtitleStreams = async (
  filePath: string,
  signal?: AbortSignal,
): Promise<SubtitleStream[]> => {
  const output = await runCommand(
    process.env.FFPROBE_PATH || "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_streams", "-select_streams", "s", filePath],
    signal,
  );

  const streams: Array<{ codec_name?: string; tags?: Record<string, string> }> =
    JSON.parse(output).streams ?? [];

  return streams.map((stream, index) => ({
    codec: stream.codec_name,
    index,
    label: stream.tags?.title,
    lang: stream.tags?.language,
  }));
};

/** Converts a subtitle file, or a video's subtitle stream, to timed text segments. */
export const readSubtitleSegments = async ({
  filePath,
  signal,
  streamIndex,
}: {
  filePath: string;
  signal?: AbortSignal;
  streamIndex?: number;
}) =>
  parseWebVtt(
    await runCommand(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        filePath,
        ...(streamIndex === undefined ? [] : ["-map", `0:s:${streamIndex}`]),
        "-f",
        "webvtt",
        "pipe:1",
      ],
      signal,
    ),
  );
