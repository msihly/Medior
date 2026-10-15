import autoBind from "auto-bind";
import { BackgroundOperationSchema, NotificationSchema } from "medior/_generated/server";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { JobState, JobType } from "medior/server/database";
import { SettingsStore } from "medior/store";
import { asyncAction, derefMobx } from "medior/utils/client";
import { isDeepEqual } from "medior/utils/common";
import { getConfig, trpc } from "medior/utils/server";

const hasOperationAction = (operation: BackgroundOperationSchema) =>
  ["PENDING", "RUNNING", "CANCELLED", "ERROR"].includes(operation.status);

/** A followed job this window never received an update for. */
const makeLostJob = (id: string): JobState => ({
  error: "",
  failures: [],
  id,
  isRunning: false,
  isStopping: false,
  item: "",
  label: "",
  message: "",
  processed: 0,
  scope: null,
  stepProgress: null,
  total: 0,
  type: null,
});

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
  /** Operations running on the server, in the order they started. */
  jobs: prop<JobState[]>(() => []).withSetter(),
  notifications: prop<NotificationSchema[]>(() => []).withSetter(),
  settings: prop<SettingsStore>(() => new SettingsStore({})),
  showFileName: prop<boolean>(() => getConfig().file.showFileName).withSetter(),
}) {
  private activityLoad: Promise<void>;
  private activityLoadRevision = 0;
  private activityOperationUpdates = new Map<string, BackgroundOperationSchema>();
  /** Recently ended jobs, for followers that start following after the job ended. */
  private finishedJobs = new Map<string, JobState>();
  private followedJobIds = new Set<string>();
  private jobFollowers = new Map<string, (job: JobState) => void>();
  private jobWaiters = new Map<string, ((job: JobState) => void)[]>();
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

  /**
   * Calls back once with the job's final state, even when it ended before being followed. Each
   * job is followed once; later calls are ignored.
   */
  followJob(id: string, onFinish: (job: JobState) => void) {
    if (this.followedJobIds.has(id)) return;

    const finished = this.finishedJobs.get(id);

    this.followedJobIds.add(id);

    if (finished) onFinish(finished);
    else this.jobFollowers.set(id, onFinish);
  }

  isFollowingJob(id: string) {
    return this.followedJobIds.has(id);
  }

  /** Follows a job's progress; an ended job is handed to its follower and anything waiting on it. */
  updateJob(job: JobState) {
    const index = this.jobs.findIndex(({ id }) => id === job.id);

    if (job.isRunning) {
      if (!this.finishedJobs.has(job.id))
        this.setJobs(
          index < 0
            ? [...this.jobs, job]
            : this.jobs.map((current, i) => (i === index ? job : current)),
        );
    } else if (!this.finishedJobs.has(job.id)) {
      const onFinish = this.jobFollowers.get(job.id);
      const waiters = this.jobWaiters.get(job.id) ?? [];

      this.setJobs(this.jobs.filter(({ id }) => id !== job.id));
      this.jobFollowers.delete(job.id);
      this.jobWaiters.delete(job.id);
      this.finishedJobs.set(job.id, job);

      // Old jobs are forgotten together with whether they were followed.
      if (this.finishedJobs.size > 50) {
        const oldestId = this.finishedJobs.keys().next().value;

        this.finishedJobs.delete(oldestId);
        this.followedJobIds.delete(oldestId);
      }

      onFinish?.(job);

      for (const resolve of waiters) resolve(job);
    }
  }

  /** Resolves with the job's final state, at once when it already ended. */
  waitForJob(id: string) {
    return new Promise<JobState>((resolve) => {
      const finished = this.finishedJobs.get(id);

      if (finished) resolve(finished);
      else this.jobWaiters.set(id, [...(this.jobWaiters.get(id) ?? []), resolve]);
    });
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
  cancelBackgroundOperation = asyncAction(async (id: string) => {
    this.activityLoadRevision++;

    const res = await trpc.cancelBackgroundOperation.mutate({ id });

    if (!res.success) throw new Error(res.error);

    this.updateBackgroundOperation(res.data);
  });

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
  loadJobs = asyncAction(async () => {
    // Jobs shown or followed before the request, including ones whose first update was missed.
    const knownIds = new Set([
      ...this.jobs.map(({ id }) => id),
      ...this.jobFollowers.keys(),
      ...this.jobWaiters.keys(),
    ]);

    const res = await trpc.listJobs.mutate();
    if (!res.success) throw new Error(res.error);

    const finishedById = new Map(res.data.finished.map((job) => [job.id, job]));
    const runningIds = new Set(res.data.running.map(({ id }) => id));

    // Known jobs that stopped running end as the server recorded them, or as lost to a restart.
    for (const id of knownIds) {
      if (!runningIds.has(id) && !this.finishedJobs.has(id)) {
        const shown = this.jobs.find((job) => job.id === id);

        this.updateJob(
          finishedById.get(id) ?? {
            ...(shown ? derefMobx(shown) : makeLostJob(id)),
            error: "The server stopped before this job finished.",
            isRunning: false,
          },
        );
      }
    }

    // Jobs that ended while the list loaded stay ended; those started meanwhile are kept.
    this.setJobs([
      ...res.data.running.filter(({ id }) => !this.finishedJobs.has(id)),
      ...this.jobs.filter(({ id }) => !knownIds.has(id) && !runningIds.has(id)),
    ]);
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

  @modelFlow
  retryBackgroundOperation = asyncAction(async (id: string) => {
    const res = await trpc.retryBackgroundOperation.mutate({ id });

    if (!res.success) throw new Error(res.error);

    await this.loadBackgroundActivity();
  });

  @modelFlow
  stopJob = asyncAction(async (id: string) => {
    const res = await trpc.stopJob.mutate({ id });
    if (!res.success) throw new Error(res.error);
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getJob(type: JobType, scope: string = null) {
    return this.jobs.find((job) => job.type === type && job.scope === scope);
  }

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
