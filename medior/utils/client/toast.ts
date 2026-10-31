import { toast as baseToast } from "trabecula/utils/client";
import { rpc } from "medior/utils/server";

type NotificationType = "error" | "info" | "success" | "warning";

type ToastContent = Parameters<typeof baseToast.info>[0];

/** Toasts also take errors, which they show by message. */
type ToastInput = ToastContent | Error;

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
      const res = await rpc.recordNotification(pendingNotifications[0]);

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

export const persistNotification = (content: ToastInput, type: NotificationType) => {
  pendingNotifications.push({ message: (content as Error)?.message ?? String(content), type });
  saveNotificationHistory();
};

const toastByType = {
  error: baseToast.error,
  info: baseToast.info,
  success: baseToast.success,
  warning: baseToast.warn,
};

const showToast = (content: ToastInput, options: ToastOptions, type: NotificationType) => {
  persistNotification(content, type);

  // Toasts can't render errors themselves, so they show the error's message.
  return toastByType[type]((content as Error)?.message ?? (content as ToastContent), options);
};

export const toast = {
  ...baseToast,
  error: (content: ToastInput, options?: ToastOptions) => showToast(content, options, "error"),
  info: (content: ToastInput, options?: ToastOptions) => showToast(content, options, "info"),
  success: (content: ToastInput, options?: ToastOptions) => showToast(content, options, "success"),
  warn: (content: ToastInput, options?: ToastOptions) => showToast(content, options, "warning"),
};
