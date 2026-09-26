import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
// @ts-expect-error
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";

const EXTERNALS = [
  "@huggingface/transformers",
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
  ],
});
