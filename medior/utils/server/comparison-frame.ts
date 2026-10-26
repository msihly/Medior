import { PassThrough } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import { runFfmpegCommand } from "./ffmpeg";
import { sharp } from "./images";

export const loadComparisonFrame = async (
  inputPath: string,
  time: number,
  isAnimated: boolean,
  signal: AbortSignal,
): Promise<string> => {
  if (signal.aborted) throw new Error("Comparison cancelled");

  let buffer: Buffer;

  if (isAnimated) {
    const chunks: Buffer[] = [];
    const output = new PassThrough();
    const command = ffmpeg(inputPath).frames(1).videoCodec("png").format("image2pipe");

    if (time > 0) {
      if (inputPath.toLowerCase().endsWith(".gif")) command.seekOutput(time);
      else command.seekInput(time);
    }

    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    await runFfmpegCommand(command.output(output), signal);

    if (!chunks.length) throw new Error("No frame found at this time");

    buffer = Buffer.concat(chunks);
  } else buffer = await sharp(inputPath).rotate().png().toBuffer();

  if (signal.aborted) throw new Error("Comparison cancelled");

  return `data:image/png;base64,${buffer.toString("base64")}`;
};
