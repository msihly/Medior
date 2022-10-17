import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginSVGR from "vite-plugin-svgr";
import pluginTsconfigPaths from "vite-tsconfig-paths";

const EXTERNALS = ["crypto", "fluent-ffmpeg", "fs", "mongoose", "sharp"];

export default defineConfig({
  build: { outDir: "build" },
  optimizeDeps: { exclude: EXTERNALS },
  plugins: [
    pluginReact(),
    pluginRenderer({
      nodeIntegration: true,
      resolve: () => EXTERNALS,
    }),
    pluginSVGR(),
    pluginTsconfigPaths(),
  ],
  server: { port: 3000 },
});
