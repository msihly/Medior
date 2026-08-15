import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("FileTransform", { defaultPageSize: 20, withStore: true });

model.addProp("afterAudioBitrate", "number");
model.addProp("afterAudioCodec", "string");
model.addProp("afterBitrate", "number");
model.addProp("afterDuration", "number");
model.addProp("afterFrameRate", "number");
model.addProp("afterHash", "string");
model.addProp("afterHeight", "number");
model.addProp("afterPath", "string");
model.addProp("afterSize", "number");
model.addProp("afterVideoCodec", "string");
model.addProp("afterWidth", "number");

model.addProp("beforeAudioBitrate", "number");
model.addProp("beforeAudioCodec", "string");
model.addProp("beforeBitrate", "number");
model.addProp("beforeDuration", "number");
model.addProp("beforeFrameRate", "number");
model.addProp("beforeHash", "string");
model.addProp("beforeHeight", "number");
model.addProp("beforePath", "string", { required: true });
model.addProp("beforeSize", "number", { required: true });
model.addProp("beforeVideoCodec", "string");
model.addProp("beforeWidth", "number");

model.addIndex({ completedAt: 1, _id: 1 }, { unique: false });
model.addProp("completedAt", "string", {
  sort: { icon: "HourglassBottom", label: "Completed At" },
});

model.addProp("configCodec", "string");
model.addProp("configMaxBitrate", "number");
model.addProp("configMaxFps", "number");
model.addProp("configMaxHeight", "number");
model.addProp("configMaxWidth", "number");
model.addProp("configOverride", "string[]", { defaultValue: "[]" });

model.addProp("errorMsg", "string");

model.addIndex({ fileId: 1, _id: 1 }, { unique: false });
model.addProp("fileId", "File.id", { required: true });

model.addIndex({ isCompleted: 1, _id: 1 }, { unique: false });
model.addProp("isCompleted", "boolean", { defaultValue: "false", required: true });

model.addProp("progressPercent", "number");
model.addProp("progressSize", "number");
model.addProp("progressTime", "string");

model.addIndex({ startedAt: 1, _id: 1 }, { unique: false });
model.addProp("startedAt", "string", { sort: { icon: "HourglassTop", label: "Started At" } });

model.addIndex({ status: 1, _id: 1 }, { unique: false });
model.addProp(
  "status",
  "string | 'COMPLETE' | 'ERROR' | 'PENDING' | 'REPLACED' | 'RUNNING' | 'SAVED'",
  {
    required: true,
    schemaType:
      "{ type: String, enum: ['COMPLETE', 'ERROR', 'PENDING', 'REPLACED', 'RUNNING', 'SAVED'] }",
    sort: { icon: "PendingActions", label: "Status" },
  },
);

model.addProp("timestampPairs", "Array<{ end: number; start: number }>", {
  defaultValue: "[]",
  schemaType: "[{ end: Number, start: Number }]",
});

model.addIndex({ type: 1, _id: 1 }, { unique: false });
model.addProp("type", "string | 'reencode' | 'remux' | 'splice'", {
  required: true,
  schemaType: "{ type: String, enum: ['reencode', 'remux', 'splice'] }",
  sort: { icon: "Movie", label: "Type" },
});

export const MODEL_FILE_TRANSFORM = model.getModel();
