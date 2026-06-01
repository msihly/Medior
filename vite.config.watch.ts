import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
// @ts-expect-error
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";
import { exec } from "child_process";

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
      name: "post-build",
      apply: "build",
      enforce: "post",
      async writeBundle() {
        if (isInitialBuild) {
          const child = exec("electron .", { cwd: process.cwd() });
          child.stdout?.pipe(process.stdout);
          child.stderr?.pipe(process.stderr);
          child.on("error", (err) => console.error("Electron launch error:", err));
          isInitialBuild = false;
        }
      },
    },
  ],
});
