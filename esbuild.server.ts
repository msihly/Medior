import { build } from "esbuild";
import path from "path";

build({
  entryPoints: [
    "medior/_generated/server/index.ts",
    "medior/server/main.ts",
    "medior/server/api-process.ts",
    "medior/server/socket-process.ts",
    "medior/server/db-process.ts",
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: "extraResources/medior",
  outbase: "medior",
  tsconfig: "medior/server/tsconfig.build.json",
  packages: "external",
  jsx: "transform",
  target: "node18",
  alias: {
    "medior": path.resolve("medior"),
  },
  external: ["@electron/remote"],
});