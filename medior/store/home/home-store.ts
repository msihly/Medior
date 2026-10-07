import autoBind from "auto-bind";
import { BackgroundOperationSchema, NotificationSchema } from "medior/_generated/server";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { SettingsStore } from "medior/store";
import { asyncAction } from "medior/utils/client";
import { isDeepEqual } from "medior/utils/common";
import { getConfig, trpc } from "medior/utils/server";

const hasOperationAction = (operation: BackgroundOperationSchema) =>
  ["PENDING", "RUNNING", "CANCELLED", "ERROR"].includes(operation.status);

const sortNotifications = (notifications: NotificationSchema[]) =>
  [...notifications].sort(
    (a, b) =>
      Number(a.isRead) - Number(b.isRead) ||
      b.dateCreated.localeCompare(a.dateCreated) ||
      b.id.localeCompare(a.id),
  );

const sortOperations = (operations: BackgroundOperationSchema[]) =>
  operations
    .filter(
      ({ dismissedAt, status, type }) =>
        !dismissedAt && (type !== "metadataAction" || status !== "COMPLETE"),
    )
    .sort(
      (a, b) =>
        Number(b.type === "mediaPathIndex" && hasOperationAction(b)) -
          Number(a.type === "mediaPathIndex" && hasOperationAction(a)) ||
        Number(["PENDING", "RUNNING"].includes(b.status)) -
          Number(["PENDING", "RUNNING"].includes(a.status)) ||
        Number(!hasOperationAction(a)) - Number(!hasOperationAction(b)) ||
        b.dateCreated.localeCompare(a.dateCreated) ||
        b.id.localeCompare(a.id),
    );

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
  private activityLoad: Promise<void>;
  private activityLoadRevision = 0;
  private activityOperationUpdates = new Map<string, BackgroundOperationSchema>();
  private notificationRevision = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addNotification(notification: NotificationSchema) {
    this.notificationRevision++;
    this.notifications = sortNotifications([
      notification,
      ...this.notifications.filter(({ id }) => id !== notification.id),
    ]).slice(0, 250);
  }

  @modelAction
  markNotificationsRead(ids: string[]) {
    this.notificationRevision++;
    this.notifications = sortNotifications(
      this.notifications.map((notification) =>
        ids.includes(notification.id) ? { ...notification, isRead: true } : notification,
      ),
    );
  }

  @modelAction
  updateBackgroundOperation(operation: BackgroundOperationSchema) {
    const index = this.backgroundOperations.findIndex(({ id }) => id === operation.id);

    if (index >= 0 && this.backgroundOperations[index].dateModified > operation.dateModified)
      return;

    if (this.activityLoad) this.activityOperationUpdates.set(operation.id, operation);

    this.backgroundOperations = sortOperations([
      operation,
      ...this.backgroundOperations.filter(({ id }) => id !== operation.id),
    ]).slice(0, 100);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadBackgroundActivity = asyncAction(async () => {
    if (this.activityLoad) return this.activityLoad;

    this.activityLoad = (async () => {
      this.activityOperationUpdates.clear();

      const notificationRevision = this.notificationRevision;
      const revision = ++this.activityLoadRevision;
      const res = await trpc.listBackgroundActivity.mutate();

      if (!res.success) throw new Error(res.error);

      if (revision !== this.activityLoadRevision) return;

      const notificationsById = new Map(
        res.data.notifications.map((notification) => [notification.id, notification]),
      );

      const operationsById = new Map(
        res.data.operations.map((operation) => [operation.id, operation]),
      );

      if (notificationRevision !== this.notificationRevision) {
        for (const notification of this.notifications)
          notificationsById.set(notification.id, notification);
      }

      for (const operation of this.activityOperationUpdates.values()) {
        if (
          !operationsById.has(operation.id) ||
          operation.dateModified >= operationsById.get(operation.id).dateModified
        )
          operationsById.set(operation.id, operation);
      }

      const notifications = sortNotifications([...notificationsById.values()]).slice(0, 250);
      const operations = sortOperations([...operationsById.values()]).slice(0, 100);

      if (!isDeepEqual(this.backgroundOperations, operations))
        this.setBackgroundOperations(operations);

      if (!isDeepEqual(this.notifications, notifications)) this.setNotifications(notifications);
    })().finally(() => {
      this.activityLoad = null;
      this.activityOperationUpdates.clear();
    });

    return this.activityLoad;
  });

  @modelFlow
  retryBackgroundOperation = asyncAction(async (id: string) => {
    const res = await trpc.retryBackgroundOperation.mutate({ id });

    if (!res.success) throw new Error(res.error);

    await this.loadBackgroundActivity();
  });

  @modelFlow
  cancelBackgroundOperation = asyncAction(async (id: string) => {
    this.activityLoadRevision++;

    const res = await trpc.cancelBackgroundOperation.mutate({ id });

    if (!res.success) throw new Error(res.error);

    this.updateBackgroundOperation(res.data);
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
