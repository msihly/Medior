import autoBind from "auto-bind";
import { BackgroundOperationSchema, NotificationSchema } from "medior/_generated/server";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { SettingsStore } from "medior/store";
import { asyncAction } from "medior/utils/client";
import { getConfig, trpc } from "medior/utils/server";

@model("medior/HomeStore")
export class HomeStore extends Model({
  backgroundOperations: prop<BackgroundOperationSchema[]>(() => []).withSetter(),
  fileCardFit: prop<"contain" | "cover">(() => getConfig().file.fileCardFit).withSetter(),
  isActivityOpen: prop<boolean>(false).withSetter(),
  isDraggingIn: prop<boolean>(false).withSetter(),
  isDraggingOut: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  notifications: prop<NotificationSchema[]>(() => []).withSetter(),
  settings: prop<SettingsStore>(() => new SettingsStore({})),
  showFileName: prop<boolean>(() => getConfig().file.showFileName).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addNotification(notification: NotificationSchema) {
    this.notifications = [notification, ...this.notifications].slice(0, 250);
  }

  @modelAction
  markNotificationsRead(ids: string[]) {
    this.notifications = this.notifications.map((notification) =>
      ids.includes(notification.id) ? { ...notification, isRead: true } : notification,
    );
  }

  @modelAction
  updateBackgroundOperation(operation: BackgroundOperationSchema) {
    this.backgroundOperations = [
      operation,
      ...this.backgroundOperations.filter(({ id }) => id !== operation.id),
    ].slice(0, 100);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadBackgroundActivity = asyncAction(async () => {
    const res = await trpc.listBackgroundActivity.mutate();
    if (!res.success) throw new Error(res.error);
    this.setBackgroundOperations(res.data.operations);
    this.setNotifications(res.data.notifications);
  });

  @modelFlow
  readNotifications = asyncAction(async () => {
    const ids = this.notifications
      .filter((notification) => !notification.isRead)
      .map((notification) => notification.id);
    if (!ids.length) return;

    const res = await trpc.markNotificationsRead.mutate({ ids });
    if (!res.success) throw new Error(res.error);
    this.markNotificationsRead(ids);
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get hasRunningBackgroundOperations() {
    return this.backgroundOperations.some(
      ({ status }) => status === "PENDING" || status === "RUNNING",
    );
  }

  get hasUnreadErrors() {
    return this.notifications.some(({ isRead, type }) => !isRead && type === "error");
  }

  get hasUnreadNotifications() {
    return this.notifications.some(({ isRead }) => !isRead);
  }
}
