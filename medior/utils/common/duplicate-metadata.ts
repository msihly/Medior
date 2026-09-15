import type { FileSchema } from "medior/_generated/server/models";

type DuplicateMetadata = Pick<
  FileSchema,
  "diffusionParams" | "originalName" | "rating" | "tagIds" | "timestamps" | "transcription"
>;

export const mergeDuplicateMetadata = (original: DuplicateMetadata, match: DuplicateMetadata) => ({
  diffusionParams: match.diffusionParams || original.diffusionParams,
  hasTranscript: Boolean(match.transcription?.text || original.transcription?.text),
  originalName: match.originalName || original.originalName,
  rating: Math.max(original.rating ?? 0, match.rating ?? 0),
  tagIds: [...new Set([...(match.tagIds ?? []), ...(original.tagIds ?? [])].map(String))].sort(),
  timestamps: [
    ...(match.timestamps ?? []).map((timestamp) => ({
      ...timestamp,
      label:
        timestamp.label ||
        original.timestamps?.find((existing) => existing.id === timestamp.id)?.label,
      pairs: [
        ...(timestamp.pairs ?? []),
        ...(
          original.timestamps?.find((existing) => existing.id === timestamp.id)?.pairs ?? []
        ).filter((pair) => !(timestamp.pairs ?? []).some((existing) => existing.id === pair.id)),
      ].map((pair, order) => ({ ...pair, order })),
    })),
    ...(original.timestamps ?? []).filter(
      (timestamp) => !(match.timestamps ?? []).some((existing) => existing.id === timestamp.id),
    ),
  ],
  transcription: match.transcription?.text
    ? match.transcription
    : (original.transcription ?? match.transcription),
});

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
