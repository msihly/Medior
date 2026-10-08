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
      operation = leanModelToJson<BackgroundOperationSchema>(
        await BackgroundOperationModel.findOne({
          status: { $in: ["PENDING", "RUNNING"] },
          type: "audioAnalysis",
        })
          .select({ targetIds: { $slice: 1 } })
          .sort({ dateCreated: 1 })
          .lean(),
      );

      if (!operation) return;

      backgroundExecution.getStore().operationId = operation.id;

      if (operation.status === "PENDING")
        await setBackgroundOperationStatus(operation.id, "RUNNING");

      const fileId = operation.targetIds[0];

      if (!fileId) {
        await completeEmptyBackgroundOperation(operation.id, "Imported audio analysis completed.");
        continue;
      }

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
          socket.emit("onBackgroundOperationUpdated", {
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

        socket.emit("onFilesUpdated", { fileIds: [fileId], updates });
      }

      await completeBackgroundOperationTargets(
        operation.id,
        [fileId],
        "Imported audio analysis saved.",
        operation.targetVersions ?? {},
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
