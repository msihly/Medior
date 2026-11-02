import { PassThrough } from "node:stream";
import { runFfmpeg } from "./ffmpeg";
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
    const isGif = inputPath.toLowerCase().endsWith(".gif");
    const seek = time > 0 ? ["-ss", `${time}`] : [];

    output.on("data", (chunk: Buffer) => chunks.push(chunk));
    await runFfmpeg(
      [
        ...(isGif ? [] : seek),
        "-i",
        inputPath,
        "-vframes",
        "1",
        "-vcodec",
        "png",
        "-f",
        "image2pipe",
        ...(isGif ? seek : []),
        "pipe:1",
      ],
      { signal, stdout: output },
    );

    if (!chunks.length) throw new Error("No frame found at this time");

    buffer = Buffer.concat(chunks);
  } else buffer = await sharp(inputPath).rotate().png().toBuffer();

  if (signal.aborted) throw new Error("Comparison cancelled");

  return `data:image/png;base64,${buffer.toString("base64")}`;
};
