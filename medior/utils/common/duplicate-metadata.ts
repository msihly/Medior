import type { FileSchema } from "medior/_generated/server/models";
import { hasTranscription, normalizeTimestampPairs } from "./media-metadata";

type DuplicateMetadata = Pick<
  FileSchema,
  "diffusionParams" | "originalName" | "rating" | "tagIds" | "timestamps" | "transcription"
>;

export const mergeDuplicateMetadata = (original: DuplicateMetadata, match: DuplicateMetadata) => {
  const matchedIds = new Set((match.timestamps ?? []).map(({ id }) => id));
  const originalTimestamps = new Map<string, FileSchema["timestamps"][number]>();

  for (const timestamp of original.timestamps ?? []) {
    if (!originalTimestamps.has(timestamp.id)) originalTimestamps.set(timestamp.id, timestamp);
  }

  return {
    diffusionParams: match.diffusionParams || original.diffusionParams,
    hasTranscript:
      hasTranscription(match.transcription) || hasTranscription(original.transcription),
    originalName: match.originalName || original.originalName,
    rating: Math.max(original.rating ?? 0, match.rating ?? 0),
    tagIds: [...new Set([...(match.tagIds ?? []), ...(original.tagIds ?? [])].map(String))].sort(),
    timestamps: [
      ...(match.timestamps ?? []).map((timestamp) => {
        const existing = originalTimestamps.get(timestamp.id);
        const pairIds = new Set((timestamp.pairs ?? []).map(({ id }) => id));
        const pairs = normalizeTimestampPairs(timestamp.pairs ?? []);

        return {
          ...timestamp,
          label: timestamp.label || existing?.label,
          pairs: [
            ...pairs,
            ...normalizeTimestampPairs(existing?.pairs ?? [])
              .filter((pair) => !pairIds.has(pair.id))
              .map((pair, index) => ({ ...pair, order: pairs.length + index + 1 })),
          ],
        };
      }),
      ...(original.timestamps ?? [])
        .filter((timestamp) => !matchedIds.has(timestamp.id))
        .map((timestamp) => ({
          ...timestamp,
          pairs: normalizeTimestampPairs(timestamp.pairs ?? []),
        })),
    ],
    transcription: hasTranscription(match.transcription)
      ? match.transcription
      : (original.transcription ?? match.transcription),
  };
};

export const replaceDuplicateCollectionReferences = (
  entries: { fileId: string; index: number }[],
  originalId: string,
  matchId: string,
) => {
  const seen = new Set<string>();

  return [...entries]
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({
      ...entry,
      fileId: String(entry.fileId) === originalId ? matchId : String(entry.fileId),
    }))
    .filter(({ fileId }) => {
      if (seen.has(fileId)) return false;

      seen.add(fileId);

      return true;
    })
    .map((entry, index) => ({ ...entry, index }));
};
