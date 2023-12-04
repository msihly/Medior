import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";

const EXTERNALS = [
  "@tensorflow/tfjs-node",
  "@tensorflow/tfjs-node-gpu",
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

export default defineConfig({
  build: { outDir: "build" },
  optimizeDeps: { exclude: EXTERNALS },
  plugins: [
    pluginReact(),
    pluginRenderer({ nodeIntegration: true, resolve: () => EXTERNALS }),
    pluginSVGR(),
    pluginTsconfigPaths(),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".mts", ".jsx", ".js", ".mjs", ".json"],
  },
  server: { port: 3333 },
});
