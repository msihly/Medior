import autoBind from "auto-bind";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { asyncAction, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { MediaProgram, MediaProgramEditorStore, MediaProgramManagerStore } from ".";

export type MediaProgramStatusUpdates = Partial<
  Pick<MediaProgram, "isRewatching" | "rating" | "watchStatus">
>;

@model("medior/MediaProgramStore")
export class MediaProgramStore extends Model({
  editor: prop<MediaProgramEditorStore>(() => new MediaProgramEditorStore({})),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<MediaProgramManagerStore>(() => new MediaProgramManagerStore({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  updateVisiblePrograms(id: string, updates: Partial<ModelCreationData<MediaProgram>>) {
    this.manager.search.getResult(id)?.update(updates);

    if (this.editor.program?.id === id) this.editor.updateProgram(updates);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createMediaProgram = asyncAction(async (name: string) => {
    const res = await trpc.createMediaProgram.mutate({ name });

    if (!res.success) throw new Error(res.error);

    return res.data;
  });

  @modelFlow
  deleteMediaPrograms = asyncAction(
    async ({ ids, withCollections }: { ids: string[]; withCollections: boolean }) => {
      const res = await trpc.deleteMediaPrograms.mutate({ ids, withCollections });

      if (!res.success) throw new Error(res.error);

      this.manager.search.setSelectedIds(
        this.manager.search.selectedIds.filter((id) => !ids.includes(id)),
      );

      if (ids.includes(this.editor.program?.id)) this.editor.setIsOpen(false);

      toast.success(`Deleted ${ids.length} media programs`);
    },
  );

  @modelFlow
  regenMediaProgramMeta = asyncAction(async (ids: string[]) => {
    const res = await trpc.regenMediaProgramAttrs.mutate({ ids });

    if (!res.success) throw new Error(res.error);

    toast.success("Media program metadata refreshed");
  });

  /** Applies rating, watch status, and rewatch changes immediately. */
  @modelFlow
  updateMediaProgram = asyncAction(
    async ({ id, updates }: { id: string; updates: MediaProgramStatusUpdates }) => {
      const res = await trpc.updateMediaProgram.mutate({
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
}
