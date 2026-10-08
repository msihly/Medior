import { ChildProcess, spawn } from "child_process";
import { createRequire } from "module";
import type { RollupWatcher } from "rollup";
import { build, createServer, ViteDevServer } from "vite";
import { ownProcessTree, PROCESS_SHUTDOWN_TIMEOUT_MS } from "../medior/server/process-job";

ownProcessTree();

let electron: ChildProcess;
let relaunch = false;
let server: ViteDevServer;
let shutdown: Promise<void>;
let stopping = false;
let watcher: RollupWatcher;

const stop = () => {
  stopping = true;

  shutdown ??= (async () => {
    console.log("Stopping the development watcher and requesting Medior shutdown...");

    const deadline = setTimeout(() => {
      console.error("Development shutdown deadline exceeded; terminating the owned process tree.");
      process.exit(1);
    }, PROCESS_SHUTDOWN_TIMEOUT_MS + 5000);

    await Promise.all([
      watcher?.close(),
      server?.close(),
      new Promise<void>((resolve, reject) => {
        if (!electron || electron.exitCode !== null || electron.signalCode !== null) {
          resolve();

          return;
        }

        electron.once("exit", () => resolve());

        if (electron.connected)
          electron.send({ type: "stop" }, (error) => {
            if (error) reject(error);
          });
        else reject(new Error("Electron IPC unavailable; shutting down the owned process tree."));
      }),
    ]);

    clearTimeout(deadline);
    console.log("This development session and its watcher stopped.");
    process.exit(process.exitCode ?? 0);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });

  return shutdown;
};

const handleError = (error: Error) => {
  console.error(error);
  process.exitCode = 1;
  stop();
};

const launch = () => {
  if (electron || stopping) return;

  const executable = createRequire(import.meta.url)("electron");

  if (typeof executable !== "string") throw new Error("Electron executable path is unavailable.");

  electron = spawn(executable, ["."], {
    // Console signals go through IPC; the Windows job owns the child's lifetime.
    detached: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });

  electron.stdout?.pipe(process.stdout);
  electron.stderr?.pipe(process.stderr);
  electron.once("error", handleError);

  electron.on("message", (message: { type?: string }) => {
    if (message?.type === "relaunch" && !stopping) relaunch = true;
  });

  electron.once("exit", (code, signal) => {
    if (relaunch && !stopping && code === 0) {
      electron = null;
      relaunch = false;
      launch();
    } else {
      if (!stopping) console.log(`Medior exited (code: ${code}, signal: ${signal ?? "none"}).`);

      process.exitCode = code ?? 1;
      stop();
    }
  });
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

(async () => {
  if (process.argv.includes("hmr")) {
    server = await createServer({ configFile: "vite.config.hmr.ts" });
    await server.listen();
    launch();
  } else {
    watcher = (await build({
      configFile: "vite.config.watch.ts",
      mode: "development",
    })) as RollupWatcher;

    watcher.on("event", (event) => {
      if (event.code === "BUNDLE_END") launch();
      else if (event.code === "ERROR") console.error(event.error);
    });
  }

  if (stopping) {
    await watcher?.close();
    await server?.close();
  }
})().catch(handleError);
