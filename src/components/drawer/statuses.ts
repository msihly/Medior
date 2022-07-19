import { colors } from "@mui/material";
import { IconName } from "components";

interface ImportStatus {
  color: string;
  icon: IconName;
}

export const IMPORT_STATUSES = {
  COMPLETE: {
    color: colors.green["700"],
    icon: "CheckCircle",
  } as ImportStatus,
  DUPLICATE: {
    color: colors.amber["700"],
    icon: "ControlPointDuplicate",
  } as ImportStatus,
  ERROR: {
    color: colors.red["800"],
    icon: "Error",
  } as ImportStatus,
  PENDING: {
    color: colors.blueGrey["600"],
    icon: "Pending",
  } as ImportStatus,
};
