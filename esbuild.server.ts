import { build, BuildOptions } from "esbuild";
import path from "path";

const common: BuildOptions = {
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "extraResources/medior",
  outbase: "medior",
  tsconfig: "medior/server/tsconfig.build.json",
  jsx: "transform",
  target: "node18",
  alias: { medior: path.resolve("medior") },
};

const nativeAddons = [
  "@electron/remote",
  "@tensorflow/tfjs-node-gpu",
  "@tensorflow/tfjs-node",
  "electron",
  "sharp-bmp",
  "sharp",
  "trash",
];

(async () => {
  await build({
    ...common,
    entryPoints: [
      "medior/_generated/server/index.ts",
      "medior/server/db-process.ts",
      "medior/server/socket-process.ts",
    ],
    external: nativeAddons,
  });

  await build({
    ...common,
    entryPoints: ["medior/server/main.ts", "medior/server/api-process.ts"],
    external: [...nativeAddons, "fluent-ffmpeg"],
  });
})();
