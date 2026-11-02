import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginRendererCjsShim from "vite-plugin-electron-renderer/cjs-shim";

const EXTERNALS = ["@huggingface/transformers", "fdir", "mongoose", "sharp"];

export default defineConfig({
  build: {
    // The server build is copied into the output folder before the renderer builds.
    emptyOutDir: false,
    minify: false,
    outDir: "build",
    // CommonJS output loads every Node module import with `require`, wherever it appears.
    rolldownOptions: {
      output: { format: "cjs" },
      // CommonJS has no import.meta; only Vite's preload code, unused in CommonJS, reads these.
      transform: { define: { "import.meta.resolve": "undefined", "import.meta.url": "undefined" } },
    },
    sourcemap: true,
    watch: {
      include: ["medior/**/*"],
    },
  },
  define: {
    "process.env.BUILD_DEV": true,
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
    pluginRendererCjsShim(),
  ],
  resolve: { tsconfigPaths: true },
});
