import { randomUUID } from "crypto";
import { serverShutdownSignal } from "trabecula/utils/process";
import { socket } from "medior/utils/server";
import { FileLockOwner, lockFiles, runAsLockOwner, unlockFiles } from "./file-locks";

export type JobType =
  | "deleteFiles"
  | "deleteTags"
  | "mergeDuplicates"
  | "refreshFiles"
  | "regenerateTagRegEx"
  | "unarchiveFiles";

export interface JobState {
  error: string;
  /** Problems that skipped part of the work without stopping the job, with how much each skipped. */
  failures: { count: number; message: string }[];
  id: string;
  isRunning: boolean;
  isStopping: boolean;
  /** What the job is working on, such as the file being refreshed. */
  item: string;
  label: string;
  message: string;
  processed: number;
  /** What the job belongs to, such as the duplicate search it archives from. */
  scope: string;
  /** Percent done of the current item, when its work reports it. */
  stepProgress: number | null;
  total: number;
  type: JobType;
}

export interface Job {
  /** Adds work to the job, locking its files until they are completed. */
  add: (fileIds: string[], count?: number) => void;
  /** Counts work skipped for a reason without stopping the job. */
  addFailure: (message: string, count?: number) => void;
  /** Counts finished work and releases its files. */
  complete: (fileIds: string[], count?: number) => void;
  id: string;
  report: (updates: Partial<Pick<JobState, "item" | "message" | "stepProgress">>) => void;
  signal: AbortSignal;
}

interface RunningJob {
  controller: AbortController;
  /** Settles once the job has ended and released its files. */
  done: Promise<void>;
  emitTimer: ReturnType<typeof setTimeout>;
  failures: Map<string, number>;
  handle: Job;
  owner: FileLockOwner;
  state: JobState;
}

const jobs = new Map<string, RunningJob>();
/** Final states of recently ended jobs, for windows that missed their last update. */
const finishedJobs = new Map<string, JobState>();

const getJobState = (job: RunningJob): JobState => ({
  ...job.state,
  failures: [...job.failures].map(([message, count]) => ({ count, message })),
});

/** Progress is sent at most four times a second; the final state is sent at once. */
const emitJob = (job: RunningJob, isFinal = false) => {
  if (isFinal) {
    clearTimeout(job.emitTimer);
    job.emitTimer = null;
    socket.emitReliable("onJobUpdated", getJobState(job));
  } else
    job.emitTimer ??= setTimeout(() => {
      job.emitTimer = null;
      socket.emitReliable("onJobUpdated", getJobState(job));
    }, 250);
};

/** Adds work to a running job, as its own work does. */
export const addToJob = (id: string, fileIds: string[], count?: number) =>
  jobs.get(id)?.handle.add(fileIds, count);

export const findJob = (type: JobType, scope: string = null) =>
  [...jobs.values()].find((job) => job.state.type === type && job.state.scope === scope)?.state.id;

export const getFinishedJobs = () => [...finishedJobs.values()];

export const getJobs = () => [...jobs.values()].map(getJobState);

export const isJobStopping = (id: string) => !!jobs.get(id)?.state.isStopping;

/**
 * Runs work on the server apart from any window, locking its files until each is completed and
 * releasing the rest when it ends. Returns the job's ID once its files are locked.
 */
export const startJob = ({
  fileIds = [],
  label,
  run,
  scope = null,
  total = fileIds.length,
  type,
}: {
  fileIds?: string[];
  label: string;
  run: (job: Job) => Promise<void>;
  scope?: string;
  total?: number;
  type: JobType;
}) => {
  const id = randomUUID();
  const owner = { id: `job:${id}`, label };

  lockFiles(owner, fileIds);

  const job: RunningJob = {
    controller: new AbortController(),
    done: null,
    emitTimer: null,
    failures: new Map(),
    handle: null,
    owner,
    state: {
      error: "",
      failures: [],
      id,
      isRunning: true,
      isStopping: false,
      item: "",
      label,
      message: "",
      processed: 0,
      scope,
      stepProgress: null,
      total,
      type,
    },
  };

  job.handle = {
    add: (addedIds, count = addedIds.length) => {
      lockFiles(owner, addedIds);
      job.state.total += count;
      emitJob(job);
    },
    addFailure: (message, count = 1) => {
      job.failures.set(message, (job.failures.get(message) ?? 0) + count);
      emitJob(job);
    },
    complete: (completedIds, count = completedIds.length) => {
      unlockFiles(owner.id, completedIds);
      job.state.processed += count;
      emitJob(job);
    },
    id,
    report: (updates) => {
      Object.assign(job.state, updates);
      emitJob(job);
    },
    signal: job.controller.signal,
  };

  const abort = () => job.controller.abort(serverShutdownSignal.reason);

  jobs.set(id, job);
  serverShutdownSignal.addEventListener("abort", abort, { once: true });
  emitJob(job, true);

  job.done = (async () => {
    try {
      await runAsLockOwner(owner.id, () => run(job.handle));
    } catch (error) {
      // A stopped job reports what it finished rather than why it was interrupted.
      if (!job.controller.signal.aborted) job.state.error = error?.message ?? String(error);
    } finally {
      serverShutdownSignal.removeEventListener("abort", abort);
      unlockFiles(owner.id);
      jobs.delete(id);
      job.state.isRunning = false;
      finishedJobs.set(id, getJobState(job));

      if (finishedJobs.size > 50) finishedJobs.delete(finishedJobs.keys().next().value);

      emitJob(job, true);
    }
  })();

  return id;
};

/** Stops a job, interrupting work that follows its signal and skipping what remains. */
export const requestJobStop = (id: string) => {
  const job = jobs.get(id);
  if (!job) return;

  job.state.isStopping = true;
  job.controller.abort();
  emitJob(job, true);
};

/** Settles once the job has ended and released its files, at once when it isn't running. */
export const waitForJob = (id: string) => jobs.get(id)?.done ?? Promise.resolve();
