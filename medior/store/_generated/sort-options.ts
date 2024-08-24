/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import { IconName, IconProps } from "medior/components/media/icon";

export interface SortOption {
  attribute: string;
  icon: IconName;
  iconProps?: Partial<IconProps>;
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
  FileCollection: [
    { attribute: "dateCreated", icon: "DateRange", label: "Date Created" },
    { attribute: "dateModified", icon: "DateRange", label: "Date Modified" },
    { attribute: "fileCount", icon: "Numbers", label: "File Count" },
    { attribute: "rating", icon: "Star", label: "Rating" },
    { attribute: "title", icon: "Title", label: "Title" },
  ],
  FileImportBatch: [{ attribute: "dateCreated", icon: "DateRange", label: "Date Created" }],
  File: [
    { attribute: "dateCreated", icon: "DateRange", label: "Date Created" },
    { attribute: "dateModified", icon: "DateRange", label: "Date Modified" },
    { attribute: "duration", icon: "HourglassBottom", label: "Duration" },
    { attribute: "height", icon: "Height", label: "Height" },
    { attribute: "rating", icon: "Star", label: "Rating" },
    { attribute: "size", icon: "FormatSize", label: "Size" },
    { attribute: "width", icon: "Height", iconProps: { rotation: 90 }, label: "Width" },
  ],
  RegExMap: [],
  Tag: [
    { attribute: "dateCreated", icon: "DateRange", label: "Date Created" },
    { attribute: "count", icon: "Numbers", label: "Count" },
    { attribute: "dateModified", icon: "DateRange", label: "Date Modified" },
    { attribute: "label", icon: "Label", label: "Label" },
  ],
};
