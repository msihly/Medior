import { PassThrough } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import { sharp } from "./images";

export const loadComparisonFrame = async (
  inputPath: string,
  time: number,
  isAnimated: boolean,
  signal: AbortSignal,
): Promise<string> => {
  if (signal.aborted) throw new Error("Comparison cancelled");

  const buffer = isAnimated
    ? await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const output = new PassThrough();
        const command = ffmpeg(inputPath).frames(1).videoCodec("png").format("image2pipe");
        if (time > 0) {
          if (inputPath.toLowerCase().endsWith(".gif")) command.seekOutput(time);
          else command.seekInput(time);
        }

        const handleAbort = () => {
          command.kill("SIGKILL");
          output.destroy();
          reject(new Error("Comparison cancelled"));
        };

        output.on("data", (chunk: Buffer) => chunks.push(chunk));
        output.on("error", reject);
        command.on("error", reject);
        command.on("end", () => {
          if (!chunks.length) reject(new Error("No frame found at this time"));
          else resolve(Buffer.concat(chunks));
        });
        signal.addEventListener("abort", handleAbort, { once: true });
        const cleanup = () => signal.removeEventListener("abort", handleAbort);
        command.on("end", cleanup).on("error", cleanup);
        command.on("start", () => {
          if (signal.aborted) handleAbort();
        });
        command.pipe(output);
      })
    : await sharp(inputPath).rotate().png().toBuffer();

  if (signal.aborted) throw new Error("Comparison cancelled");
  return `data:image/png;base64,${buffer.toString("base64")}`;
};
