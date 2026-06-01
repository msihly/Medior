import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
// @ts-expect-error
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";

const EXTERNALS = [
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
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"],
  },
  server: { port: 3333, strictPort: true },
});
