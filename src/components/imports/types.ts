import { ModelCreationData } from "mobx-keystone";
import { FileImport } from "src/store";

export type FlatFolderHierarchy = {
  collectionTitle?: string;
  folderName: string;
  folderNameParts: string[];
  imports: ModelCreationData<FileImport>[];
  tags: TagToUpsert[];
}[];

export type FolderToCollMode = "none" | "withoutTag" | "withTag";

export type FolderToTagsMode = "cascading" | "hierarchical" | "none";

export type TagToUpsert = {
  aliases?: string[];
  children?: TagToUpsert[];
  id?: string;
  label: string;
  parentLabels?: string[];
  withRegEx?: boolean;
};
