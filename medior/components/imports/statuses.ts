import { IconName } from "medior/components";
import { colors } from "medior/utils";

interface Status {
  color: string;
  icon: IconName;
  label: string;
}

export const IMPORT_STATUSES: Record<string, Status> = {
  COMPLETE: {
    color: colors.green["700"],
    icon: "CheckCircle",
    label: "Completed",
  },
  DELETED: {
    color: colors.red["800"],
    icon: "Delete",
    label: "Previously Deleted",
  },
  DUPLICATE: {
    color: colors.amber["700"],
    icon: "ControlPointDuplicate",
    label: "Duplicate",
  },
  ERROR: {
    color: colors.red["800"],
    icon: "Error",
    label: "Error",
  },
  PENDING: {
    color: colors.blueGrey["600"],
    icon: "Pending",
    label: "Pending",
  },
};

export type ImportStatus = keyof typeof IMPORT_STATUSES;
