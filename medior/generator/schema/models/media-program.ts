import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("MediaProgram");

model.addIndex({ "collectionIdIndexes.collectionId": 1 }, { unique: false });
model.addProp("collectionIdIndexes", "Array<{ collectionId: string; index: number }>", {
  defaultValue: "[]",
  required: true,
  schemaType: "[{ collectionId: Schema.Types.ObjectId, index: Number }]",
});

model.addIndex({ dateLastWatched: 1, _id: 1 });
model.addProp("dateLastWatched", "string", {
  sort: { icon: "History", label: "Date Last Watched" },
});

model.addIndex({ dateModified: 1, _id: 1 });
model.addProp("dateModified", "string", {
  defaultValue: "null",
  required: true,
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addIndex({ fileCount: 1, _id: 1 });
model.addProp("fileCount", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Numbers", label: "Episode Count" },
});

model.addIndex({ genreIds: 1, _id: 1 });
model.addProp("genreIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addProp("isRewatching", "boolean", { defaultValue: "false", required: true });

model.addIndex({ language: 1, _id: 1 });
model.addProp("language", "string");

model.addProp("lastWatchedFileId", "File.id");

model.addIndex({ medium: 1, _id: 1 });
model.addProp("medium", "string");

model.addIndex({ name: 1, _id: 1 });
model.addProp("name", "string", { required: true, sort: { icon: "Title", label: "Name" } });

model.addProp("posterFileId", "File.id");

model.addIndex({ rating: 1, _id: 1 });
model.addProp("rating", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Star", label: "Rating" },
});

model.addProp("ratingIsManual", "boolean");

model.addProp("rewatchCount", "number", { defaultValue: "0", required: true });

model.addProp("rewatchedFileIds", "File.id[]", { defaultValue: "[]", required: true });

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "FormatSize", label: "Size" },
});

model.addIndex(
  { sourceFolderKey: 1 },
  { partialFilterExpression: { sourceFolderKey: { $type: "string" } }, unique: true },
);
model.addProp("sourceFolderKey", "string");

model.addProp("sourceFolderPath", "string");

model.addIndex({ tagIds: 1, _id: 1 });
model.addProp("tagIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addIndex({ tagIdsWithAncestors: 1, _id: 1 });
model.addProp("tagIdsWithAncestors", "Tag.id[]", { defaultValue: "[]", required: true });

model.addIndex({ type: 1, _id: 1 });
model.addProp("type", "string");

model.addIndex({ watchStatus: 1, _id: 1 });
model.addProp("watchStatus", "'dropped' | 'inactive' | 'unwatched' | 'watched' | 'watching'", {
  defaultValue: '"unwatched" as const',
  required: true,
  schemaType: "{ type: String, enum: ['dropped', 'inactive', 'unwatched', 'watched', 'watching'] }",
});

model.addProp("watchedFileIds", "File.id[]", { defaultValue: "[]", required: true });

model.addIndex({ year: 1, _id: 1 });
model.addProp("year", "number", { sort: { icon: "CalendarMonth", label: "Year" } });

export const MODEL_MEDIA_PROGRAM = model.getModel();
