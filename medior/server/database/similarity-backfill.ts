import { Schema } from "mongoose";
import type {
  SimilarityBackfillProgress,
  SimilarityVectorType,
} from "medior/server/vector-service";
import { registerPersistenceModel } from "./persistence";

export interface SimilarityBackfillArgs {
  fileIds?: string[];
  force?: boolean;
  vectorTypes?: SimilarityVectorType[];
}

export const SimilarityBackfillModel = registerPersistenceModel(
  "SimilarityBackfill",
  new Schema<{
    _id: string;
    args: SimilarityBackfillArgs;
    cursor?: string;
    offset: number;
    progress: SimilarityBackfillProgress;
    queueKey?: string;
  }>(
    {
      _id: String,
      args: Schema.Types.Mixed,
      cursor: String,
      offset: { default: 0, type: Number },
      progress: Schema.Types.Mixed,
      queueKey: String,
    },
    { writeConcern: { j: true, w: "majority" } },
  ).index(
    { queueKey: 1 },
    { partialFilterExpression: { queueKey: { $exists: true } }, unique: true },
  ),
);
