import { Model, model, prop } from "mobx-keystone";
import { File, TagOption } from "medior/store";
import { FileCollection } from ".";
import { SortMenuProps } from "medior/components";
import { getConfig } from "medior/utils";

@model("medior/CollectionManager")
export class CollectionManager extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  searchPage: prop<number>(1).withSetter(),
  searchPageCount: prop<number>(1).withSetter(),
  searchResults: prop<FileCollection[]>(() => []).withSetter(),
  searchSort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.managerSearchSort
  ).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  files: prop<File[]>(() => []).withSetter(),
  tagSearchValue: prop<TagOption[]>(() => []).withSetter(),
  titleSearchValue: prop<string>("").withSetter(),
}) {}
