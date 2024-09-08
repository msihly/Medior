import { ModelCreationData } from "mobx-keystone";
import { FileImport } from "medior/store";

export type FlatFolder = {
  collectionTitle?: string;
  folderName: string;
  folderNameParts: string[];
  imports: ModelCreationData<FileImport>[];
  tags: TagToUpsert[];
};

export type FlatFolderHierarchy = Map<string, FlatFolder>;

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
