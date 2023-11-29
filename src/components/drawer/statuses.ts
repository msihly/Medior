import { IconName } from "components";
import { colors } from "utils";

interface Status {
  color: string;
  icon: IconName;
}

export const IMPORT_STATUSES = {
  COMPLETE: {
    color: colors.green["700"],
    icon: "CheckCircle",
  } as Status,
  DUPLICATE: {
    color: colors.amber["700"],
    icon: "ControlPointDuplicate",
  } as Status,
  ERROR: {
    color: colors.red["800"],
    icon: "Error",
  } as Status,
  PENDING: {
    color: colors.blueGrey["600"],
    icon: "Pending",
  } as Status,
};

export type ImportStatus = keyof typeof IMPORT_STATUSES;
