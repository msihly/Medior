import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";

const EXTERNALS = [
  "@tensorflow/tfjs-node",
  "@tensorflow/tfjs-node-gpu",
  "@vladmandic/face-api/dist/face-api.node-gpu.js",
  "aws-sdk",
  "crypto",
  "electron-log",
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
      name: "post-build",
      apply: "build",
      enforce: "post",
      writeBundle: async () => {
        if (isInitialBuild) {
          const { exec } = await import("child_process");
          exec("electron .");
          isInitialBuild = false;
        }
      },
    },
  ],
});
