import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { RootStore } from "medior/store";
import { asyncAction, toast, toastJobResult } from "medior/utils/client";
import { TranslationDisplay } from "medior/utils/common";
import { rpc } from "medior/utils/server";

@model("medior/MediaProgramTitleTranslationStore")
export class MediaProgramTitleTranslationStore extends Model({
  /** Which of the titles and their translations saving shows on episode cards. */
  display: prop<TranslationDisplay>("translation").withSetter(),
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isSaving: prop<boolean>(false).withSetter(),
  isTranslating: prop<boolean>(false).withSetter(),
  /** The server job translating the titles, which the modal shows the progress of. */
  jobId: prop<string>(null).withSetter(),
  programId: prop<string>(null),
  /** The metadata source's titles of the episodes being translated, in their episodes' order. */
  titles: prop<string[]>(() => []),
}) {
  private translationId = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  close() {
    this.display = "translation";
    this.isMinimized = false;
    this.isOpen = false;
    this.programId = null;
    this.titles = [];
  }

  @modelAction
  private show(programId: string, titles: string[]) {
    this.display = "translation";
    this.isMinimized = false;
    this.isOpen = true;
    this.programId = programId;
    this.titles = titles;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Opens the modal and translates the titles, showing their translations once they're stored. */
  @modelFlow
  open = asyncAction(async ({ programId, titles }: { programId: string; titles: string[] }) => {
    if (!titles.length) return;

    this.show(programId, [...new Set(titles)]);

    const res = await this.translate();
    if (!res.success) toast.error(res.error);
  });

  /** Saves which of the titles and their translations shows on episode cards, then closes. */
  @modelFlow
  save = asyncAction(async () => {
    this.setIsSaving(true);

    try {
      const res = await rpc.saveEpisodeTitleTranslations({
        display: this.display,
        id: this.programId,
        titles: [...this.titles],
      });
      if (!res.success) throw new Error(res.error);

      this.close();
    } finally {
      this.setIsSaving(false);
    }
  });

  /**
   * Translates the titles on the server, which reports its result from the corner when the modal
   * is minimized. `force` replaces stored translations rather than reusing them.
   */
  @modelFlow
  translate = asyncAction(async ({ force = false }: { force?: boolean } = {}) => {
    const stores = getRootStore<RootStore>(this);

    const translationId = ++this.translationId;

    this.setIsTranslating(true);

    try {
      const res = await rpc.startEpisodeTitleTranslation({
        force,
        id: this.programId,
        titles: [...this.titles],
      });
      if (!res.success) throw new Error(res.error);

      if (translationId === this.translationId) this.setJobId(res.data);

      stores.home.followJob(res.data, toastJobResult);

      await stores.home.waitForJob(res.data);
    } finally {
      // A translation started since, after closing and reopening, owns the modal's state.
      if (translationId === this.translationId) {
        this.setIsTranslating(false);
        this.setJobId(null);

        // A minimized translation closes once done, its job's result toasted from the corner.
        if (this.isMinimized) this.close();
      }
    }
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get job() {
    return getRootStore<RootStore>(this).home.getJobById(this.jobId);
  }
}
