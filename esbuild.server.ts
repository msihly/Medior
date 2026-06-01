import { build } from "esbuild";
import path from "path";

(async () => {
  await build({
    alias: { medior: path.resolve("medior") },
    bundle: true,
    entryPoints: [
      "medior/_generated/server/index.ts",
      "medior/server/api-process.ts",
      "medior/server/db-process.ts",
      "medior/server/main.ts",
      "medior/server/socket-process.ts",
    ],
    external: [
      "@electron/remote",
      "@tensorflow/tfjs-node-gpu",
      "@tensorflow/tfjs-node",
      "@vladmandic/face-api",
      "electron",
      "fdir",
      "fluent-ffmpeg",
      "sharp-bmp",
      "sharp",
      "trash",
    ],
    format: "cjs",
    jsx: "transform",
    outbase: "medior",
    outdir: "extraResources/medior",
    platform: "node",
    target: "node18",
    tsconfig: "medior/server/tsconfig.build.json",
  });
})();
