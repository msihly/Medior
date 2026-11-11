import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { RootStore } from "medior/store";
import { asyncAction, toast, toastJobResult } from "medior/utils/client";
import { FileTranslationSource, TranslationDisplay } from "medior/utils/common";
import { rpc } from "medior/utils/server";

@model("medior/FileTranslationStore")
export class FileTranslationStore extends Model({
  /** Which of the names and their translations saving shows on the files' cards. */
  display: prop<TranslationDisplay>("translation").withSetter(),
  fileIds: prop<string[]>(() => []),
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  /** The files are still being translated, staying locked until the job is done with them. */
  isTranslating: prop<boolean>(false).withSetter(),
  /** The server job translating the files, which the modal shows the progress of. */
  jobId: prop<string>(null).withSetter(),
  /** What the translation covers, or everything the files have when null. */
  sources: prop<FileTranslationSource[]>(null),
  /** The files the last finished translation stored translations for, kept after closing. */
  translatedFileIds: prop<string[]>(() => []),
  /** Counts finished translations, so views showing their files know to read them again. */
  translationCount: prop<number>(0),
}) {
  private translationId = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  close() {
    this.display = "translation";
    this.fileIds = [];
    this.isMinimized = false;
    this.isOpen = false;
    this.sources = null;
  }

  @modelAction
  private markTranslated(fileIds: string[]) {
    this.translatedFileIds = fileIds;
    this.translationCount++;
  }

  @modelAction
  private show(fileIds: string[], sources: FileTranslationSource[]) {
    this.display = "translation";
    this.fileIds = fileIds;
    this.isMinimized = false;
    this.isOpen = true;
    this.sources = sources;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Opens the modal and translates the files, showing their translations once they're stored. */
  @modelFlow
  open = asyncAction(
    async ({
      fileIds,
      sources = null,
    }: {
      fileIds: string[];
      sources?: FileTranslationSource[];
    }) => {
      if (!fileIds.length) return;

      this.show([...new Set(fileIds)], sources);

      const res = await this.translate();
      if (!res.success) toast.error(res.error);
    },
  );

  /** Saves which of the names and their translations shows on the files' cards, then closes. */
  @modelFlow
  save = asyncAction(async () => {
    this.setIsSaving(true);

    try {
      const res = await rpc.saveNameTranslations({
        display: this.display,
        fileIds: [...this.fileIds],
      });
      if (!res.success) throw new Error(res.error);

      this.close();
    } finally {
      this.setIsSaving(false);
    }
  });

  /**
   * Translates the files on the server, or adds them to the translation already running, which
   * reports its result from the corner when the modal is minimized. `force` replaces stored
   * translations rather than reusing them.
   */
  @modelFlow
  translate = asyncAction(async ({ force = false }: { force?: boolean } = {}) => {
    const stores = getRootStore<RootStore>(this);

    const fileIds = [...this.fileIds];
    const translationId = ++this.translationId;

    let jobId: string = null;

    this.setIsTranslating(true);

    try {
      const res = await rpc.startFileTranslation({
        fileIds,
        force,
        sources: this.sources ? [...this.sources] : undefined,
      });
      if (!res.success) throw new Error(res.error);

      jobId = res.data;

      if (translationId === this.translationId) this.setJobId(jobId);

      stores.home.followJob(jobId, toastJobResult);

      await Promise.all(fileIds.map((id) => stores.file.waitForFileRelease(id, jobId)));

      this.markTranslated(fileIds);
    } finally {
      // A translation started since, after closing and reopening, owns the modal's state.
      if (translationId === this.translationId) {
        this.setIsTranslating(false);
        this.setJobId(null);

        // A minimized translation closes once done, like a refresh. Its job's result is toasted
        // when the job ends, which a job still translating other files hasn't yet.
        if (this.isMinimized) {
          if (stores.home.getJobById(jobId))
            toast.success(fileIds.length === 1 ? "Translation stored" : "Translations stored");

          this.close();
        }
      }
    }
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get job() {
    return getRootStore<RootStore>(this).home.getJobById(this.jobId);
  }
}
