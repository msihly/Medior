import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("FileTransform", {
  defaultPageSize: "() => getConfig().file.transforms.search.pageSize",
  defaultSort: "() => getConfig().file.transforms.search.sort",
});

model.addDateRangeProp("completedAt");
model.addDateRangeProp("dateCreated");
model.addDateRangeProp("startedAt");

model.addLogOpProp("afterSize");
model.addLogOpProp("beforeSize");

model.addProp("beforePath", "string", "null", {
  objPath: ["beforePath", "$regex"],
  objValue: 'new RegExp(args.beforePath, "i")',
});

model.addProp("isCompleted", "boolean", "false", {
  customActionProps: [
    model.makeCustomActionProp({
      condition: "true",
      objPath: ["isCompleted"],
      objValue: "args.isCompleted",
    }),
  ],
  objPath: ["isCompleted"],
  objValue: "args.isCompleted",
});

model.addProp("status", "string", '""', {
  objPath: ["status"],
  objValue: "args.status",
});

model.addProp("type", "string", '""', {
  objPath: ["type"],
  objValue: "args.type",
});

export const MODEL_SEARCH_STORE_FILE_TRANSFORM = model.getModel();
