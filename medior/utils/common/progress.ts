/** A running task's step, with its elapsed seconds and share done when they are known. */
export interface TaskProgress {
  elapsed?: number;
  message: string;
  progress?: number;
}
