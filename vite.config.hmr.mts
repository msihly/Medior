import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";

const EXTERNALS = ["@huggingface/transformers", "fdir", "mongoose", "sharp"];

export default defineConfig({
  build: {
    outDir: "build",
    rolldownOptions: { input: { app: "./index.hmr.html" } },
  },
  plugins: [
    pluginReact(),
    pluginRenderer({
      resolve: {
        ...Object.fromEntries(EXTERNALS.map((name) => [name, { type: "cjs" as const }])),
        // Bundling resolves trash's dependencies to their browser builds, so it loads at runtime.
        trash: { bundle: false, type: "esm" },
      },
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"],
    tsconfigPaths: true,
  },
  server: {
    open: "./index.hmr.html",
    port: 3333,
    strictPort: true,
  },
});
