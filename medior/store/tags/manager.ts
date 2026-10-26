import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { EditMultiTagRelationsInput, JobState } from "medior/server/database";
import { RootStore, TagOption, TagSearch } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { trpc } from "medior/utils/server";

@model("medior/TagManagerStore")
export class TagManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  /** The modal is hidden while its job runs in the background. */
  isMinimized: prop<boolean>(false).withSetter(),
  isMultiTagEditorOpen: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  /** The server job deleting tags or regenerating their RegEx, started here. */
  jobId: prop<string>(null).withSetter(),
  search: prop<TagSearch>(() => new TagSearch({})),
}) {
  /** The tags sent to each job, in the order it processes them. */
  private jobTagIds = new Map<string, string[]>();

  onInit() {
    autoBind(this);
  }

  private followJob(jobId: string, tagIds: string[]) {
    const stores = getRootStore<RootStore>(this);

    stores.home.followJob(jobId, this.finishJob, () => {
      this.jobTagIds.set(jobId, tagIds);
      this.setIsMinimized(false);
      this.setJobId(jobId);
    });
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  findTagsOnSameFiles(tag: TagOption) {
    this.search.reset();
    this.search.setFileTags([tag]);

    if (this.isOpen) this.search.loadFiltered({ page: 1 });
    else this.setIsOpen(true);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  deleteTags = asyncAction(async (tagIds: string[]) => {
    if (this.jobId) return;

    const res = await trpc.startTagDeletion.mutate({ tagIds });
    if (!res.success) throw new Error(res.error);

    this.followJob(res.data, tagIds);
  });

  @modelFlow
  editMultiTagRelations = asyncAction(async (args: EditMultiTagRelationsInput) => {
    const res = await trpc.editMultiTagRelations.mutate(args);

    if (!res.success) throw new Error(res.error);

    return res.data;
  });

  /**
   * Takes in a tag job's results once it ends. Deletion goes through its tags in order, so the
   * processed count covers the first.
   */
  @modelFlow
  private finishJob = asyncAction(async (job: JobState) => {
    const tagIds = this.jobTagIds.get(job.id) ?? [];

    this.jobTagIds.delete(job.id);

    if (this.jobId === job.id) this.setJobId(null);

    if (job.type === "deleteTags") {
      const deletedIds = tagIds.slice(0, job.processed);

      this.search.toggleSelected(deletedIds.map((id) => ({ id, isSelected: false })));
      toast.info(
        `${Fmt.commas(job.processed)} tags deleted${job.isStopping ? " before cancellation" : ""}`,
      );
    } else if (job.type === "regenerateTagRegEx") {
      // Deleted tags leave the results through sockets; rebuilt RegEx is updated on visible tags.
      const jobTagIds = new Set(tagIds);
      const visibleIds = this.search.results
        .filter((tag) => jobTagIds.has(tag.id))
        .map((tag) => tag.id);

      if (visibleIds.length) {
        const res = await trpc.listTag.mutate({ filter: { id: visibleIds } });

        if (!res.success) toast.error(res.error);
        else for (const tag of res.data) this.search.getResult(tag.id)?.update(tag);
      }
    }

    if (job.error) toast.error(job.error);

    // A minimized manager closes once its job ends, rather than covering the window again.
    if (this.isMinimized) {
      this.setIsMinimized(false);
      this.setIsOpen(false);
    }
  });

  @modelFlow
  refreshSelectedTags = asyncAction(async () => {
    const result = await trpc.refreshTag.mutate({ tagIds: this.search.selectedIds });

    if (!result.success) throw new Error(result.error);

    toast.success("Tag refresh queued in Activity");
  });

  @modelFlow
  regenerateRegEx = asyncAction(async (tagIds: string[]) => {
    if (this.jobId) return;

    const res = await trpc.startTagRegExRegeneration.mutate({ tagIds });
    if (!res.success) throw new Error(res.error);

    this.followJob(res.data, tagIds);
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get job() {
    return getRootStore<RootStore>(this).home.getJobById(this.jobId);
  }
}
