import { FileImport } from "store";

export type FlatFolderHierarchy = {
  collectionTitle?: string;
  folderName: string;
  folderNameParts: string[];
  imports: FileImport[];
  tags: TagToUpsert[];
}[];

export type FolderToCollMode = "none" | "withoutTag" | "withTag";

export type FolderToTagsMode = "cascading" | "hierarchical" | "none";

export type TagToUpsert = {
  aliases?: string[];
  children?: TagToUpsert[];
  id?: string;
  label: string;
  parentLabel?: string;
};
