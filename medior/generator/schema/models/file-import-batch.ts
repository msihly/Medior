import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("FileImportBatch", { withStore: true });

model.addProp("collectionId", "string");

model.addProp("collectionTitle", "string");

model.addProp("completedAt", "string", { required: true });

model.addProp("deleteOnImport", "boolean", { required: true });

model.addProp("ignorePrevDeleted", "boolean", { required: true });

model.addProp("imports", "FileImport[]", {
  defaultValue: "[]",
  schemaToStoreName: "FileImport",
  schemaType: [
    model.makeProp("dateCreated", "string", { required: true }),
    model.makeProp("diffusionParams", "string"),
    model.makeProp("errorMsg", "string"),
    model.makeProp("extension", "string", { required: true }),
    model.makeProp("fileId", "File.id"),
    model.makeProp("name", "string", { required: true }),
    model.makeProp("path", "string", { required: true }),
    model.makeProp("size", "number", { required: true }),
    model.makeProp(
      "status",
      "string | 'COMPLETE' | 'DELETED' | 'DUPLICATE' | 'ERROR' | 'PENDING'",
      {
        schemaType:
          "{ type: String, enum: ['COMPLETE', 'DELETED', 'DUPLICATE', 'ERROR', 'PENDING'] }",
      }
    ),
    model.makeProp("tagIds", "Tag.id[]"),
    model.makeProp("thumb", "{ frameHeight?: number; frameWidth?: number; path: string }", {
      schemaType: "{ frameHeight: Number, frameWidth: Number, path: String }",
    }),
  ],
  storeType: "Stores.FileImport[]",
  typeName: "FileImport",
  withStore: true,
});

model.addProp("remux", "boolean");

model.addProp("rootFolderPath", "string", { required: true });

model.addProp("startedAt", "string");

model.addProp("tagIds", "Tag.id[]", { required: true });

export const MODEL_FILE_IMPORT_BATCH = model.getModel();
