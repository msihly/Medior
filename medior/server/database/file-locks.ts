import { AsyncLocalStorage } from "async_hooks";
import { socket } from "medior/utils/server";
import { backgroundExecution } from "./background-execution";
import { metadataMutation } from "./metadata-mutations";

export interface FileLockOwner {
  id: string;
  /** Names the operation in refusals and on locked tiles. */
  label: string;
}

const fileLocks = new Map<string, FileLockOwner>();
/** The operation whose work is running, which may change the files it locked. */
const lockOwner = new AsyncLocalStorage<string>();
/** Each changed file's latest lock label, or null once released, waiting to be sent. */
const pendingUpdates = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> = null;

/** Sends lock changes together, so operations releasing files one at a time stay cheap to follow. */
const flushUpdates = () => {
  const fileIdsByLabel = new Map<string | null, string[]>();

  flushTimer = null;

  for (const [fileId, label] of pendingUpdates) {
    if (!fileIdsByLabel.has(label)) fileIdsByLabel.set(label, []);
    fileIdsByLabel.get(label).push(fileId);
  }

  pendingUpdates.clear();

  for (const [label, fileIds] of fileIdsByLabel)
    socket.emit("onFileLocksUpdated", { fileIds, label });
};

const queueUpdates = (fileIds: string[], label: string | null) => {
  if (!fileIds.length) return;

  for (const fileId of fileIds) pendingUpdates.set(fileId, label);

  flushTimer ??= setTimeout(flushUpdates, 250);
};

const throwIfLocked = (fileIds: string[], ownerId: string) => {
  const countsByLabel = new Map<string, number>();
  let count = 0;

  for (const fileId of fileIds) {
    const owner = fileLocks.get(fileId);

    if (owner && owner.id !== ownerId) {
      countsByLabel.set(owner.label, (countsByLabel.get(owner.label) ?? 0) + 1);
      count++;
    }
  }

  if (count)
    throw new Error(
      `${count === 1 ? "1 file is" : `${count} files are`} locked by ${[...countsByLabel.keys()].join(" and ")} until ${count === 1 ? "it is" : "they are"} processed.`,
    );
};

/**
 * Refuses changes to files another operation has locked. Work running inside an operation, such as
 * a tag merge or a repair, belongs to that operation and is never refused.
 */
export const assertFilesUnlocked = (fileIds: string[]) => {
  if (metadataMutation.getStore()?.active || backgroundExecution.getStore()) return;

  throwIfLocked(fileIds, lockOwner.getStore());
};

/**
 * Refuses a saved request's changes to files another operation locks when it runs, including
 * requests resumed after a restart or retried from Activity, which run as background work.
 */
export const assertRequestFilesUnlocked = (fileIds: string[]) =>
  throwIfLocked(fileIds, lockOwner.getStore());

export const getFileLocks = () => {
  const fileIdsByLabel = new Map<string, string[]>();

  for (const [fileId, { label }] of fileLocks) {
    if (!fileIdsByLabel.has(label)) fileIdsByLabel.set(label, []);
    fileIdsByLabel.get(label).push(fileId);
  }

  return [...fileIdsByLabel].map(([label, fileIds]) => ({ fileIds, label }));
};

/**
 * The label of the operation locking a file, unless it's the operation running this work. Automatic
 * work, such as finalizing queued transforms or repairing thumbnails, leaves such files for later
 * instead of failing.
 */
export const getForeignFileLock = (fileId: string) => {
  const owner = fileLocks.get(fileId);

  return owner && owner.id !== lockOwner.getStore() ? owner.label : null;
};

/** Locks files for an operation, refusing all of them if another operation holds any. */
export const lockFiles = (owner: FileLockOwner, fileIds: string[]) => {
  throwIfLocked(fileIds, owner.id);

  const locked = [...new Set(fileIds)].filter((fileId) => !fileLocks.has(fileId));

  for (const fileId of locked) fileLocks.set(fileId, owner);

  queueUpdates(locked, owner.label);
};

/** Runs an operation's work, which may change the files the operation locked. */
export const runAsLockOwner = <T>(ownerId: string, run: () => Promise<T>) =>
  lockOwner.run(ownerId, run);

/** Runs work apart from the operation that started it, such as a queue it triggered. */
export const runOutsideLockOwner = <T>(run: () => T) => lockOwner.exit(run);

/** Releases an operation's locks on the given files, or on all of its files. */
export const unlockFiles = (ownerId: string, fileIds?: string[]) => {
  const unlocked = [...new Set(fileIds ?? fileLocks.keys())].filter(
    (fileId) => fileLocks.get(fileId)?.id === ownerId,
  );

  for (const fileId of unlocked) fileLocks.delete(fileId);

  queueUpdates(unlocked, null);
};
