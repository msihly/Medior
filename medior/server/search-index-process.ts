import type { Config } from "medior/utils/server/config";

process.on("disconnect", () => process.exit(1));

process.on(
  "message",
  async ({
    id,
    input,
  }: {
    id: string;
    input: {
      config: Config["file"]["similarity"]["index"]["ivfPq"];
      dbPath: string;
      distanceType: "cosine";
      isUpdate: boolean;
      tableName: string;
    };
  }) => {
    try {
      const lancedb = await import("@lancedb/lancedb");
      const db = await lancedb.connect(input.dbPath);
      const table = await db.openTable(input.tableName);

      try {
        // Similarity indexing commits every 512 files, leaving thousands of small fragments that
        // make sampling and shuffling slow. Compaction merges them and, once the index exists,
        // appends rows vectorized since the last build without retraining partitions.
        await table.optimize({ cleanupOlderThan: new Date(), deleteUnverified: false });

        if (!input.isUpdate)
          await table.createIndex("vector", {
            config: lancedb.Index.ivfPq({
              distanceType: input.distanceType,
              maxIterations: input.config.maxIterations,
              numBits: input.config.numBits,
              numPartitions: input.config.numPartitions || undefined,
              numSubVectors: input.config.numSubVectors || undefined,
              sampleRate: input.config.sampleRate,
            }),
          });
      } finally {
        table.close();
        db.close();
      }

      process.send({ data: null, id });
    } catch (error) {
      process.send({ error: error.message, id });
    }
  },
);
