import { IconName } from "medior/components";
import { colors } from "medior/utils";

interface Status {
  color: string;
  icon: IconName;
  label: string;
}

export const IMPORT_STATUSES: Record<string, Status> = {
  COMPLETE: {
    color: colors.custom.green,
    icon: "CheckCircle",
    label: "Completed",
  },
  DELETED: {
    color: colors.custom.red,
    icon: "Delete",
    label: "Previously Deleted",
  },
  DUPLICATE: {
    color: colors.custom.orange,
    icon: "ControlPointDuplicate",
    label: "Duplicate",
  },
  ERROR: {
    color: colors.custom.red,
    icon: "Error",
    label: "Error",
  },
  PENDING: {
    color: colors.custom.blueGrey,
    icon: "Pending",
    label: "Pending",
  },
};

export type ImportStatus = keyof typeof IMPORT_STATUSES;
