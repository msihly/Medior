import { ModelCreationData } from "mobx-keystone";
import { TagSchema } from "medior/server/database";
import { FileImport } from "medior/store";
import { MediaProgramPlan } from "medior/utils/common";

export type FlatFolder = {
  collectionTitle?: string;
  folderName: string;
  folderNameParts: string[];
  imports: ModelCreationData<FileImport>[];
  /** The program this folder is a season of, with the program defaults from its import options. */
  mediaProgram?: Pick<MediaProgramPlan, "folderPath" | "language" | "medium" | "type"> & {
    seasonLabel: string;
    seasonNumber: number | null;
  };
  savedConfigLabel?: string;
  tags: TagToUpsert[];
};

export type FlatFolderHierarchy = Map<string, FlatFolder>;

export type FolderToCollMode = "none" | "withoutTag" | "withTag";

export type FolderToTagsMode = "cascading" | "hierarchical" | "none";

export type TagToUpsert = {
  aliases?: string[];
  category?: TagSchema["category"];
  children?: TagToUpsert[];
  count?: number;
  id?: string;
  label: string;
  parentLabels?: string[];
  withRegEx?: boolean;
};
