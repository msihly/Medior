import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("Tag", {
  defaultPageSize: "() => getConfig().tags.manager.search.pageSize",
  defaultSort: "() => getConfig().tags.manager.search.sort",
  transformResultsFn: "await trpc.deriveTagCategories.mutate(items)",
});

model.addTagOptsProp("_id", "ancestorIds");

model.addProp("alias", "string", '""', {
  filterGroup: "alias",
  objPath: ["aliases", "$elemMatch", "$regex"],
  objValue: "args.alias",
});

model.addLogOpProp("count");

model.addLogOpProp("numOfChildTags", {
  objPath: ["$expr", "~logicOpsToMongo(args.numOfChildTags.logOp)"],
  objValue: "[{ $size: { $ifNull: ['$childIds', []] } }, args.numOfChildTags.value]",
});

model.addLogOpProp("numOfParentTags", {
  objPath: ["$expr", "~logicOpsToMongo(args.numOfParentTags.logOp)"],
  objValue: "[{ $size: { $ifNull: ['$parentIds', []] } }, args.numOfParentTags.value]",
});

model.addLogOpProp("rating");
model.addLogOpProp("size");

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateModified");
model.addDateRangeProp("dateOfInception");

model.addProp("fileTags", "Stores.TagOption[]", "() => []", {
  customActionProps: [
    {
      condition: "args.fileTagId",
      name: "fileTagId",
      objPath: ["$and"],
      objValue: `[{ _id: {
        $in: await models.FileModel.distinct("tagIds", { tagIds: objectId(args.fileTagId) }),
        $ne: objectId(args.fileTagId),
      } }]`,
      type: "string",
    },
  ],
  filterTransform: "fileTagId: this.fileTags[0]?.id",
  noInterface: true,
});

model.addProp("hasRegEx", "boolean", "null", {
  objPath: ["$expr"],
  objValue: `{ [args.hasRegEx ?  "$ne" : "$eq"]: [{ $ifNull: ["$regEx", ""] }, ""] }`,
});

model.addProp("label", "string", '""', {
  filterGroup: "label",
  objPath: ["label", "$regex"],
  objValue: "args.label",
});

model.addProp("title", "string", '""', {
  filterGroup: "title",
  objPath: ["title", "$regex"],
  objValue: "args.title",
});

export const MODEL_SEARCH_STORE_TAG = model.getModel();
