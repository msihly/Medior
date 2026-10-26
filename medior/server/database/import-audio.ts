import path from "path";
import {
  BackgroundOperationModel,
  BackgroundOperationSchema,
  FileModel,
} from "medior/_generated/server/models";
import {
  canRunBackgroundQueues,
  completeBackgroundOperationTargets,
  completeEmptyBackgroundOperation,
  emitBackgroundOperation,
  failBackgroundOperation,
  makeBackgroundOperationRunner,
  queueBackgroundOperation,
  setBackgroundOperationStatus,
} from "medior/server/database/actions/background-operations";
import {
  backgroundExecution,
  checkBackgroundExecution,
} from "medior/server/database/background-execution";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import { leanModelToJson, socket } from "medior/utils/server";
import { analyzeAudio } from "medior/utils/server/audio-analysis";
import { workSignal } from "medior/utils/server/work-signal";

const processImportedAudio = async () => {
  while (canRunBackgroundQueues()) {
    let operation: BackgroundOperationSchema;

    try {
      const [queued] = await BackgroundOperationModel.aggregate([
        { $match: { status: { $in: ["PENDING", "RUNNING"] }, type: "audioAnalysis" } },
        { $sort: { dateCreated: 1 } },
        { $limit: 1 },
        // Failed files stay queued, so the next file to analyze is within the first failures + 1.
        {
          $project: {
            failures: 1,
            status: 1,
            targetIds: {
              $slice: ["$targetIds", { $add: [{ $size: { $ifNull: ["$failures", []] } }, 1] }],
            },
          },
        },
      ]);

      operation = leanModelToJson<BackgroundOperationSchema>(queued);

      if (!operation) return;

      backgroundExecution.getStore().operationId = operation.id;

      if (operation.status === "PENDING")
        await setBackgroundOperationStatus(operation.id, "RUNNING");

      const failedIds = new Set(operation.failures?.map((failure) => failure.targetId));
      const fileId = operation.targetIds.find((id) => !failedIds.has(id));

      if (!fileId) {
        if (failedIds.size)
          await failBackgroundOperation(
            operation.id,
            [...failedIds],
            `${failedIds.size} imported files could not be analyzed. See the individual failures below.`,
          );
        else
          await completeEmptyBackgroundOperation(
            operation.id,
            "Imported audio analysis completed.",
          );

        continue;
      }

      // Read before analyzing, so a file queued again meanwhile stays queued for another pass.
      const targetVersions = (
        await BackgroundOperationModel.findById(operation.id)
          .select({ [`targetVersions.${fileId}`]: 1 })
          .lean()
      )?.targetVersions;

      try {
        const file = await FileModel.findById(fileId)
          .select({ audioCodec: 1, hash: 1, path: 1, peakDecibels: 1, waveformPeaks: 1 })
          .lean();

        if (
          file?.audioCodec &&
          file.audioCodec !== "None" &&
          (!file.waveformPeaks?.length || file.peakDecibels == null)
        ) {
          let lastProgress = 0;

          const reportProgress = (message: string) => {
            const now = Date.now();

            if (now - lastProgress < 1000) return;

            lastProgress = now;
            socket.emitVolatile("onBackgroundOperationUpdated", {
              id: operation.id,
              updates: { message: `${path.basename(file.path)}: ${message}` },
            });
          };

          const analysis = await analyzeAudio(file.path, reportProgress, workSignal.getStore(), {
            withTranscription: false,
            withWaveform: true,
          });

          checkBackgroundExecution();

          const updates = {
            peakDecibels: analysis.peakDecibels,
            waveformPeaks: analysis.waveformPeaks,
          };
          const result = await FileModel.updateOne(
            { _id: file._id, hash: file.hash, path: file.path },
            { $set: updates },
            metadataWriteOptions(),
          );

          if (!result.matchedCount)
            throw new Error("File changed during audio analysis; retry analysis");

          socket.emitVolatile("onFilesUpdated", { fileIds: [fileId], updates });
        }
      } catch (error) {
        checkBackgroundExecution();

        // ffmpeg failing to start would fail every file, so it stops the operation instead.
        if (error.syscall?.startsWith("spawn")) throw error;

        await BackgroundOperationModel.updateOne(
          { _id: operation.id, status: { $in: ["PENDING", "RUNNING"] } },
          { $push: { failures: { message: error.message, targetId: fileId } } },
          metadataWriteOptions(),
        );

        await emitBackgroundOperation(operation.id);
        continue;
      }

      await completeBackgroundOperationTargets(
        operation.id,
        [fileId],
        "Imported audio analysis saved.",
        targetVersions ?? {},
      );
    } catch (error) {
      if (!canRunBackgroundQueues()) return;

      if (!operation) throw error;

      await setBackgroundOperationStatus(operation.id, "ERROR", {
        error: error?.message ?? String(error),
      });
    }
  }
};

const runImportedAudio = makeBackgroundOperationRunner(
  "imported audio analysis",
  processImportedAudio,
);

export const queueImportedAudio = async (fileId: string) => {
  await queueBackgroundOperation({
    label: "Imported audio analysis",
    queueKey: "audioAnalysis",
    targetIds: [fileId],
    type: "audioAnalysis",
  });

  runImportedAudio();
};
