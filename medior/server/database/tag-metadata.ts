import {
  BackgroundOperationModel,
  BackgroundOperationSchema,
  FileModel,
  TagModel,
  TagSchema,
} from "medior/_generated/server/models";
import { Types } from "mongoose";
import { runFileCleanupQueue } from "medior/server/database/actions/background-operations";
import { checkBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import { mediaPathKey } from "medior/server/database/media-paths";
import { metadataWriteOptions } from "medior/server/database/metadata-work";
import { loadTagGraph } from "medior/server/database/tag-ancestry";
import { collectRelatedTagIds } from "medior/utils/common/tag-hierarchy";
import { objectIds, socket } from "medior/utils/server";

interface TagMetadata {
  _id: Types.ObjectId;
  count: number;
  oldest: { dateCreated: string; id: Types.ObjectId; thumb: TagSchema["thumb"] };
  ratingCount: number;
  ratingTotal: number;
  size: number;
}

/** Stream matching files through the direct tag index without building an unbounded aggregation. */
export const readTagMetadata = async (
  tagIds: string[],
  operation?: BackgroundOperationSchema,
  checkCancelled?: () => void,
) => {
  checkCancelled?.();

  const tags = await TagModel.find({ _id: { $in: objectIds(tagIds) } }, null, {
    readConcern: { level: "majority" },
  })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();

  const descendants = await loadTagGraph(tagIds, true);

  checkBackgroundExecution();

  const relatedIds = objectIds([...descendants.keys()]);
  const parents = new Map([...descendants.keys()].map((id) => [id, [] as string[]]));
  const targetIds = new Set(tagIds);
  const targetsByDirectTag = new Map<string, string[]>();
  const metadata = new Map<string, TagMetadata>();

  for (const [parent, children] of descendants) {
    for (const child of children) parents.get(child).push(parent);
  }

  let scanned = 0;
  let lastProgressAt = performance.now();

  const newestFile = relatedIds.length
    ? await FileModel.findOne().select({ _id: 1 }).sort({ _id: -1 }).lean()
    : null;

  if (newestFile) {
    const files = FileModel.find({
      _id: { $lte: newestFile?._id },
      tagIds: { $in: relatedIds },
    })
      .select({ _id: 1, dateCreated: 1, rating: 1, size: 1, tagIds: 1, thumb: 1 })
      .hint({ tagIds: 1 })
      .lean()
      .cursor({ batchSize: 1000 });

    for await (const file of files) {
      checkBackgroundExecution();
      checkCancelled?.();

      const targets = new Set<string>();

      for (const directId of file.tagIds) {
        const id = String(directId);

        if (!targetsByDirectTag.has(id))
          targetsByDirectTag.set(
            id,
            collectRelatedTagIds(parents, [id]).filter((id) => targetIds.has(id)),
          );

        for (const targetId of targetsByDirectTag.get(id)) targets.add(targetId);
      }

      for (const targetId of targets) {
        let result = metadata.get(targetId);

        if (!result) {
          result = {
            _id: new Types.ObjectId(targetId),
            count: 0,
            oldest: null,
            ratingCount: 0,
            ratingTotal: 0,
            size: 0,
          };

          metadata.set(targetId, result);
        }

        result.count++;
        result.size += file.size ?? 0;

        if (file.rating > 0) {
          result.ratingCount++;
          result.ratingTotal += file.rating;
        }

        const dateCreated = file.dateCreated ?? null;
        const oldestDate = result.oldest?.dateCreated ?? null;

        if (
          !result.oldest ||
          (dateCreated === oldestDate
            ? String(file._id) < String(result.oldest.id)
            : dateCreated === null || (oldestDate !== null && dateCreated < oldestDate))
        )
          result.oldest = { dateCreated, id: file._id, thumb: file.thumb ?? null };
      }

      scanned++;

      if (operation && scanned % 1000 === 0 && performance.now() - lastProgressAt >= 1000) {
        const message = `Scanned ${scanned.toLocaleString()} matching files for ${tagIds.length} tags.`;

        await BackgroundOperationModel.updateOne(
          { _id: operation.id, status: "RUNNING" },
          { $set: { dateModified: new Date().toISOString(), message } },
          metadataWriteOptions(),
        );

        socket.emit("onBackgroundOperationUpdated", { id: operation.id, updates: { message } });
        lastProgressAt = performance.now();
      }
    }
  }

  checkBackgroundExecution();

  return {
    metadata,
    tagIds,
    tags,
    versions: operation?.targetVersions ?? {},
  };
};

/** Queue target versions retain edits made during this scan for another pass. */
export const writeTagMetadata = async (
  snapshot: Awaited<ReturnType<typeof readTagMetadata>>,
  withSub: boolean,
) => {
  checkBackgroundExecution();

  if (!snapshot.tags.length) return [];

  await TagModel.bulkWrite(
    snapshot.tags.map((tag) => {
      const meta = snapshot.metadata.get(String(tag._id));
      const rating = meta?.ratingCount ? meta.ratingTotal / meta.ratingCount : 0;
      const thumb = meta?.oldest?.thumb ?? null;

      return {
        updateOne: {
          filter: { _id: tag._id },
          update: [
            {
              $set: {
                count: meta?.count ?? 0,
                rating: { $cond: [{ $eq: ["$ratingIsManual", true] }, "$rating", rating] },
                size: meta?.size ?? 0,
                thumb: { $literal: thumb },
                thumbPathKey: { $literal: mediaPathKey(thumb?.path) },
              },
            },
            { $unset: "thumbPaths" },
          ],
        },
      };
    }),
    { ...metadataWriteOptions(), session: getBackgroundSession() },
  );

  const tags = await TagModel.find({ _id: { $in: snapshot.tags.map((tag) => tag._id) } })
    .select({ count: 1, rating: 1, size: 1, thumb: 1 })
    .lean();

  const updates = tags.map((tag) => ({
    tagId: String(tag._id),
    updates: { count: tag.count, rating: tag.rating, size: tag.size, thumb: tag.thumb },
  }));

  if (withSub) socket.emit("onTagsUpdated", { tags: updates, withFileReload: false });

  if (updates.length) runFileCleanupQueue();

  return updates;
};
