import { ModelDb } from "medior/generator/schema/generators";

/** Audio and video files in an order of their own. */
const model = new ModelDb("MusicPlaylist");

model.addProp("coverFileId", "File.id");

model.addIndex({ dateModified: 1, _id: 1 });
model.addProp("dateModified", "string", {
  defaultValue: "null",
  required: true,
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addIndex({ duration: 1, _id: 1 });
model.addProp("duration", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "HourglassBottom", label: "Duration" },
});

model.addIndex({ fileCount: 1, _id: 1 });
model.addProp("fileCount", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Numbers", label: "Track Count" },
});

model.addIndex({ fileIds: 1 }, { unique: false });
model.addProp("fileIds", "File.id[]", { defaultValue: "[]", required: true });

model.addIndex({ name: 1, _id: 1 });
model.addProp("name", "string", { required: true, sort: { icon: "Title", label: "Name" } });

model.addIndex({ rating: 1, _id: 1 });
model.addProp("rating", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Star", label: "Rating" },
});

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "FormatSize", label: "Size" },
});

export const MODEL_MUSIC_PLAYLIST = model.getModel();
