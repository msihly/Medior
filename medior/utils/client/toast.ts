import { toast as baseToast } from "trabecula/utils/client";
import { trpc } from "medior/utils/server";

type NotificationType = "error" | "info" | "success" | "warning";
type ToastContent = Parameters<typeof baseToast.info>[0];
type ToastOptions = Parameters<typeof baseToast.info>[1];

const pendingNotifications: Array<{
  message: string;
  type: NotificationType;
}> = [];
let notificationSavePromise: Promise<void> = null;

const saveNotificationHistory = () => {
  if (notificationSavePromise) return notificationSavePromise;

  notificationSavePromise = (async () => {
    while (pendingNotifications.length) {
      const res = await trpc.recordNotification.mutate(pendingNotifications[0]);
      if (!res.success) throw new Error(res.error);
      pendingNotifications.shift();
    }
  })()
    .catch((error) => console.error("Failed to save notification history", error))
    .finally(() => {
      notificationSavePromise = null;
    });
  return notificationSavePromise;
};

export const persistNotification = (content: ToastContent, type: NotificationType) => {
  const message =
    content instanceof Error
      ? content.message
      : typeof content === "string"
        ? content
        : String(content);
  pendingNotifications.push({ message, type });
  saveNotificationHistory();
};

const toastByType = {
  error: baseToast.error,
  info: baseToast.info,
  success: baseToast.success,
  warning: baseToast.warn,
};

const showToast = (content: ToastContent, options: ToastOptions, type: NotificationType) => {
  persistNotification(content, type);
  return toastByType[type](content, options);
};

export const toast = {
  ...baseToast,
  error: (content: ToastContent, options?: ToastOptions) => showToast(content, options, "error"),
  info: (content: ToastContent, options?: ToastOptions) => showToast(content, options, "info"),
  success: (content: ToastContent, options?: ToastOptions) =>
    showToast(content, options, "success"),
  warn: (content: ToastContent, options?: ToastOptions) => showToast(content, options, "warning"),
} as typeof baseToast;
