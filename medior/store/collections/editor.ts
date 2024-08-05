import { Model, model, prop } from "mobx-keystone";
import { File, TagOption } from "medior/store";
import { FileCollectionFile } from ".";
import { SortMenuProps } from "medior/components";
import { getConfig, LogicalOp } from "medior/utils";

@model("medior/CollectionEditor")
export class CollectionEditor extends Model({
  files: prop<FileCollectionFile[]>(() => []).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  id: prop<string>(null).withSetter(),
  isOpen: prop<boolean>(false),
  search: prop<CollectionEditorSearch>(() => new CollectionEditorSearch({})),
  selectedIds: prop<string[]>(() => []).withSetter(),
  withSelectedFiles: prop<boolean>(false).withSetter(),
}) {}

@model("medior/CollectionEditorSearch")
class CollectionEditorSearch extends Model({
  hasDiffParams: prop<boolean>(false).withSetter(),
  numOfTagsOp: prop<LogicalOp | "">("").withSetter(),
  numOfTagsValue: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  results: prop<File[]>(() => []).withSetter(),
  sort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.editorSearchSort
  ).withSetter(),
  value: prop<TagOption[]>(() => []).withSetter(),
}) {}