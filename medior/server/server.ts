import { availableParallelism } from "os";
import type { ServerProcessDef } from "trabecula/utils/process";
import { CONSTANTS } from "medior/utils/common";
import { getConfig } from "medior/utils/server/config";

const FILE_IO_THREAD_POOL_SIZE = Math.max(
  1,
  Math.min(CONSTANTS.FILE.IO_CONCURRENCY, availableParallelism()),
);

export const SERVER_STAGES: ServerProcessDef[][] = [
  [
    {
      fileName: "db-process",
      getEnv: () => ({ DEBUG_COLORS: "0" }),
      isGraceful: true,
      label: "Database",
    },
  ],
  [
    {
      fileName: "vector-process",
      getEnv: () => {
        // LanceDB sizes its compute (Lance), data-parallel (Rayon), and async (Tokio) pools from
        // these at load; unset, each claims every core during index builds and vector search.
        const threads = String(getConfig().file.similarity.cpuThreads);

        return {
          LANCE_CPU_THREADS: threads,
          RAYON_NUM_THREADS: threads,
          TOKIO_WORKER_THREADS: threads,
          UV_THREADPOOL_SIZE: String(FILE_IO_THREAD_POOL_SIZE),
        };
      },
      label: "Vector",
    },
  ],
  [
    {
      fileName: "api-process",
      getEnv: () => ({ UV_THREADPOOL_SIZE: String(FILE_IO_THREAD_POOL_SIZE) }),
      label: "API",
    },
    { fileName: "socket-process", label: "Socket" },
  ],
];
