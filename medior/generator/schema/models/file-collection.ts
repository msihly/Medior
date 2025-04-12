import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("FileCollection", { defaultPageSize: 50, withStore: true });

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
  sort: { icon: "Numbers", label: "File Count" },
});

model.addProp("fileIdIndexes", "Array<{ fileId: string; index: number }>", {
  schemaType: "[{ fileId: Schema.Types.ObjectId, index: Number }]",
  required: true,
});

model.addIndex({ rating: 1, _id: 1 });
model.addProp("rating", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Star", label: "Rating" },
});

model.addIndex({ tagIds: 1, _id: 1 });
model.addProp("tagIds", "Tag.id[]", {
  defaultValue: "[]",
  required: true,
});

model.addIndex({ tagIdsWithAncestors: 1, _id: 1 });
model.addProp("tagIdsWithAncestors", "Tag.id[]", {
  defaultValue: "[]",
  required: true,
});

model.addProp("thumbs", "Array<{ frameHeight?: number; frameWidth?: number; path: string }>", {
  defaultValue: "null",
  required: true,
  schemaType: "[{ frameHeight: Number, frameWidth: Number, path: String }]",
});

model.addIndex({ title: 1, _id: 1 });
model.addProp("title", "string", {
  required: true,
  sort: { icon: "Title", label: "Title" },
});

export const MODEL_FILE_COLLECTION = model.getModel();
