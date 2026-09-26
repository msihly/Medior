import { BackgroundOperationSchema, NotificationSchema } from "medior/_generated/server";
import { IconName } from "medior/components";
import { colors, CssColor } from "medior/utils/client";
import { dayjs } from "medior/utils/common";

export interface ActivityMeta {
  color: CssColor;
  icon: IconName;
}

export const NOTIFICATION_TYPE_META: Record<NotificationSchema["type"], ActivityMeta> = {
  error: { color: colors.custom.red, icon: "Error" },
  info: { color: colors.custom.blue, icon: "Info" },
  success: { color: colors.custom.green, icon: "CheckCircle" },
  warning: { color: colors.custom.orange, icon: "NewReleases" },
};

export const OPERATION_STATUS_META: Record<BackgroundOperationSchema["status"], ActivityMeta> = {
  CANCELLED: { color: colors.custom.grey, icon: "Cancel" },
  COMPLETE: { color: colors.custom.green, icon: "CheckCircle" },
  ERROR: { color: colors.custom.red, icon: "Error" },
  PENDING: { color: colors.custom.orange, icon: "HourglassEmpty" },
  RUNNING: { color: colors.custom.blue, icon: "Autorenew" },
};

export const formatDate = (date: string) => dayjs(date).format("MMM D, YYYY h:mm A");
