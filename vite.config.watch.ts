import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";
import glob from "fast-glob";
import path from "path";

const EXTERNALS = [
  "@tensorflow/tfjs-node",
  "@tensorflow/tfjs-node-gpu",
  "@vladmandic/face-api/dist/face-api.node-gpu.js",
  "aws-sdk",
  "crypto",
  "fluent-ffmpeg",
  "fs",
  "mock-aws-s3",
  "mongoose",
  "nock",
  "path",
  "sharp",
];

let isInitialBuild = true;

export default defineConfig({
  build: {
    minify: false,
    outDir: "build",
    sourcemap: true,
    watch: {
      include: ["medior/**/*"],
    },
  },
  define: {
    "process.env.BUILD_DEV": true,
  },
  optimizeDeps: { exclude: EXTERNALS },
  plugins: [
    pluginReact(),
    pluginRenderer({ nodeIntegration: true, resolve: () => EXTERNALS }),
    pluginSVGR(),
    pluginTsconfigPaths(),
    {
      name: "watcher",
      apply: "build",
      enforce: "pre",
      async buildStart() {
        const files = await glob(["medior/**/*"]);
        files.forEach((file) => this.addWatchFile(path.resolve(file)));
      },
    },
    {
      name: "post-build",
      apply: "build",
      enforce: "post",
      async writeBundle() {
        // const watchedFiles = this.getWatchFiles().filter((f) => !f.includes("node_modules"));
        // logToFile("debug", "Watched files:", JSON.stringify(watchedFiles, null, 2));

        if (isInitialBuild) {
          const { exec } = await import("child_process");
          exec("electron .");
          isInitialBuild = false;
        }
      },
    },
  ],
});
