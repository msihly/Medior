/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import { IconName } from "medior/components/media/icon";

export interface SortOption {
  attribute: string;
  icon: IconName;
  label: string;
}

export interface SortValue {
  isDesc: boolean;
  key: string;
}

export const SORT_OPTIONS: Record<
  "DeletedFile" | "FileCollection" | "FileImportBatch" | "File" | "RegExMap" | "Tag",
  SortOption[]
> = {
  DeletedFile: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
  FileCollection: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
  FileImportBatch: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
  File: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
  RegExMap: [],
  Tag: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
};
