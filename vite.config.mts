import { defineConfig } from "vite";
import pluginReact from "@vitejs/plugin-react";
import pluginRenderer from "vite-plugin-electron-renderer";
import pluginRendererCjsShim from "vite-plugin-electron-renderer/cjs-shim";

const EXTERNALS = [
  "@huggingface/transformers",
  "aws-sdk",
  "fdir",
  "fluent-ffmpeg",
  "mock-aws-s3",
  "mongoose",
  "nock",
  "sharp",
];

export default defineConfig({
  build: {
    // The renderer loads from disk, so Vite's download-size warning doesn't apply at 500 kB.
    chunkSizeWarningLimit: 4000,
    // The server build is copied into the output folder before the renderer builds.
    emptyOutDir: false,
    outDir: "build",
    // CommonJS output loads every Node module import with `require`, wherever it appears.
    rolldownOptions: {
      output: { format: "cjs" },
      // CommonJS has no import.meta; only Vite's preload code, unused in CommonJS, reads these.
      transform: { define: { "import.meta.resolve": "undefined", "import.meta.url": "undefined" } },
    },
  },
  plugins: [
    pluginReact(),
    pluginRenderer({
      resolve: Object.fromEntries(EXTERNALS.map((name) => [name, { type: "cjs" as const }])),
    }),
    pluginRendererCjsShim(),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".mts", ".json"],
    tsconfigPaths: true,
  },
  server: { port: 3333, strictPort: true },
});
