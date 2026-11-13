import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { asyncAction, toast } from "medior/utils/client";
import {
  MediaProgramMetaMatch,
  MediaProgramMetaSource,
  MediaProgramWatchStatus,
} from "medior/utils/common";
import { getConfig, rpc } from "medior/utils/server";
import {
  MediaProgram,
  MediaProgramEditorStore,
  MediaProgramManagerStore,
  MediaProgramRankingStore,
  MediaProgramTitleTranslationStore,
} from ".";

export type MediaProgramUpdates = Partial<
  Pick<
    MediaProgram,
    | "genreIds"
    | "isRewatching"
    | "language"
    | "medium"
    | "name"
    | "rating"
    | "type"
    | "watchStatus"
    | "year"
  >
>;

@model("medior/MediaProgramStore")
export class MediaProgramStore extends Model({
  editor: prop<MediaProgramEditorStore>(() => new MediaProgramEditorStore({})),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<MediaProgramManagerStore>(() => new MediaProgramManagerStore({})),
  /** The program whose metadata is being matched, from its card or the editor. */
  metaMatchProgramId: prop<string>(null).withSetter(),
  rankings: prop<MediaProgramRankingStore>(() => new MediaProgramRankingStore({})),
  titleTranslation: prop<MediaProgramTitleTranslationStore>(
    () => new MediaProgramTitleTranslationStore({}),
  ),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  updateVisiblePrograms(id: string, updates: Partial<ModelCreationData<MediaProgram>>) {
    this.manager.search.getResult(id)?.update(updates);
    this.rankings.search.getResult(id)?.update(updates);

    if (this.editor.program?.id === id) this.editor.updateProgram(updates);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createMediaProgram = asyncAction(async (name: string) => {
    const res = await rpc.createMediaProgram({ name });
    if (!res.success) throw new Error(res.error);

    return res.data;
  });

  @modelFlow
  deleteMediaPrograms = asyncAction(async (ids: string[]) => {
    const res = await rpc.deleteMediaPrograms({ ids });
    if (!res.success) throw new Error(res.error);

    this.manager.search.setSelectedIds(
      this.manager.search.selectedIds.filter((id) => !ids.includes(id)),
    );

    if (ids.includes(this.editor.program?.id)) this.editor.setIsOpen(false);

    toast.success(`Deleted ${ids.length} media programs`);
  });

  /**
   * Rederives the programs from their episodes and, when lookups are turned on in Settings, reloads
   * their details from public sources.
   */
  @modelFlow
  regenMediaProgramMeta = asyncAction(async (ids: string[]) => {
    const res = await rpc.regenMediaProgramAttrs({ ids });
    if (!res.success) throw new Error(res.error);

    if (!getConfig().mediaPrograms.metaLookups) toast.success("Media program metadata refreshed");
    else {
      const matched = await rpc.matchMediaProgramsMeta({ ids });
      if (!matched.success) throw new Error(matched.error);

      toast.success("Media program metadata refreshed; public details load in the background");
    }
  });

  @modelFlow
  searchMediaProgramMeta = asyncAction(
    async ({
      query,
      source,
      year,
    }: {
      query: string;
      source: MediaProgramMetaSource;
      year: number | null;
    }) => {
      const res = await rpc.searchMediaProgramMeta({ query, source, year });
      if (!res.success) throw new Error(res.error);

      return res.data;
    },
  );

  /** Saves the chosen match's metadata to the program, or clears its metadata without one. */
  @modelFlow
  setMediaProgramMeta = asyncAction(
    async ({ id, match }: { id: string; match: MediaProgramMetaMatch | null }) => {
      const res = await rpc.setMediaProgramMeta({ id, match });
      if (!res.success) throw new Error(res.error);

      this.updateVisiblePrograms(id, res.data);
    },
  );

  /** Sets the programs' watch status one at a time, stopping at the first that fails. */
  @modelFlow
  setWatchStatus = asyncAction(
    async ({ ids, watchStatus }: { ids: string[]; watchStatus: MediaProgramWatchStatus }) => {
      for (const id of ids) {
        const res = await this.updateMediaProgram({ id, updates: { watchStatus } });
        if (!res.success) throw new Error(res.error);
      }
    },
  );

  /** Saves a program's details, rating, watch status, and rewatch as they're changed. */
  @modelFlow
  updateMediaProgram = asyncAction(
    async ({ id, updates }: { id: string; updates: MediaProgramUpdates }) => {
      const res = await rpc.updateMediaProgram({
        id,
        updates: {
          ...updates,
          ...(updates.rating !== undefined ? { ratingIsManual: updates.rating > 0 } : {}),
        },
      });
      if (!res.success) throw new Error(res.error);

      this.updateVisiblePrograms(id, res.data);
    },
  );

  /* --------------------------------- GETTERS -------------------------------- */
  /** The program being matched, as the editor or a card shows it. */
  @computed
  get metaMatchProgram() {
    const id = this.metaMatchProgramId;

    if (!id) return null;
    else if (this.editor.program?.id === id) return this.editor.program;
    else return this.manager.search.getResult(id) ?? this.rankings.search.getResult(id) ?? null;
  }
}
