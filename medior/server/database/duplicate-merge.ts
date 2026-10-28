import * as models from "medior/_generated/server/models";
import { Types as MongoTypes } from "mongoose";
import * as actions from "medior/server/database/actions";
import { isDeepEqual } from "medior/utils/common";
import {
  mergeDuplicateMetadata,
  replaceDuplicateCollectionReferences,
} from "medior/utils/common/duplicate-metadata";

type DuplicateFile = Parameters<typeof mergeDuplicateMetadata>[0] &
  Pick<models.FileSchema, "hasTranscript"> & { _id: MongoTypes.ObjectId };

/**
 * Moves a duplicate's tags, higher rating, diffusion parameters, name, timestamps, transcript, and
 * collection entries onto the file that replaces it. Archiving the duplicate is left to the caller.
 */
export const mergeDuplicateFile = async (original: DuplicateFile, match: DuplicateFile) => {
  const metadata = mergeDuplicateMetadata(original, match);
  const updates = {
    diffusionParams: metadata.diffusionParams,
    hasTranscript: metadata.hasTranscript,
    originalName: metadata.originalName,
    timestamps: metadata.timestamps,
    transcription: metadata.transcription,
  };

  // Metadata, tags, and ratings the match already has would only rewrite it, and tags and ratings
  // would also queue metadata regeneration for nothing.
  if (Object.entries(updates).some(([key, value]) => !isDeepEqual(match[key], value))) {
    const updated = await actions.updateFile({ args: { id: match._id.toString(), updates } });
    if (!updated.success) throw new Error(updated.error);
  }

  const matchTagIds = new Set(match.tagIds?.map(String));
  const addedTagIds = metadata.tagIds.filter((tagId) => !matchTagIds.has(tagId));

  if (addedTagIds.length) {
    const tagged = await actions.editFileTags({ addedTagIds, fileIds: [match._id.toString()] });
    if (!tagged.success) throw new Error(tagged.error);
  }

  if (metadata.rating !== (match.rating ?? 0)) {
    const rated = await actions.setFileRating({
      fileIds: [match._id.toString()],
      rating: metadata.rating,
    });
    if (!rated.success) throw new Error(rated.error);
  }

  const collections = await models.FileCollectionModel.find({
    "fileIdIndexes.fileId": original._id.toString(),
  }).lean();

  for (const collection of collections) {
    const updatedCollection = await actions.updateCollection({
      fileIdIndexes: replaceDuplicateCollectionReferences(
        collection.fileIdIndexes,
        original._id.toString(),
        match._id.toString(),
      ),
      id: collection._id.toString(),
    });

    if (!updatedCollection.success) throw new Error(updatedCollection.error);
  }
};
