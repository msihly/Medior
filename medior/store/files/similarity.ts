import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, derefMobx, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { getConfig, trpc } from "medior/utils/server";
import { DuplicateFileSearch } from "./search";

interface LoadSimilarArgs {
  append?: boolean;
  limit?: number;
}

interface SimilarityCandidateMeta {
  fileId: string;
  rank: number;
  score: number;
  /** Where the closest window of an audio match begins. */
  start?: number;
}

@model("medior/FileSimilarityStore")
export class FileSimilarityStore extends Model({
  activeFileId: prop<string | null>(null).withSetter(),
  /** The stretch of the active file's audio an audio lookup compares; null compares visuals. */
  audioRange: prop<{ end: number; start: number } | null>(null).withSetter(),
  candidates: prop<SimilarityCandidateMeta[]>(() => []).withSetter(),
  error: prop<string>("").withSetter(),
  /** JSON of the filter last searched in the filter menu, which every match must pass. */
  filter: prop<string | null>(null).withSetter(),
  hasMore: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  nextOffset: prop<number>(0).withSetter(),
  /** Its filter menu only chooses matches; the lookup's ranked files fill its results. */
  search: prop<DuplicateFileSearch>(() => new DuplicateFileSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  applyFilter() {
    // The lookup's own candidate IDs aren't part of the filter the matches must pass.
    this.setFilter(JSON.stringify({ ...derefMobx(this.search.getFilterProps()), ids: undefined }));
  }

  @modelAction
  cancelLoad() {
    this.setLoadId(this.loadId + 1);
    this.search.cancelLoad();

    if (this.isLoading) this.search.setIds(this.candidates.map((candidate) => candidate.fileId));

    this.setIsLoading(false);
  }

  @modelAction
  close() {
    this.cancelLoad();
    this.setIsOpen(false);
    this.setActiveFileId(null);
    this.setAudioRange(null);
    this.setCandidates([]);
    this.setError("");
    this.setFilter(null);
    this.setHasMore(false);
    this.setNextOffset(0);
    this.search.reset();
  }

  @modelAction
  removeFiles(fileIds: string[]) {
    const removedIds = new Set(fileIds);

    if (!this.search.ids.some((id) => removedIds.has(id))) return;

    this.cancelLoad();
    this.setCandidates(
      this.candidates
        .filter((candidate) => !removedIds.has(candidate.fileId))
        .map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    );

    this.search.removeFiles(fileIds);
    this.search.setIds(this.search.ids.filter((id) => !removedIds.has(id)));
    this.search.setSelectedIds(this.search.selectedIds.filter((id) => !removedIds.has(id)));
    this.search.setCarouselFileIds(this.search.carouselFileIds.filter((id) => !removedIds.has(id)));
    this.search.setCachedFilterProps({
      ...this.search.cachedFilterProps,
      ids: [...this.search.ids],
    });

    this.search.setPageCount(Math.ceil(this.search.ids.length / this.search.pageSize));
    this.search.setPage(Math.min(this.search.page, Math.max(1, this.search.pageCount)));

    // A page left empty shows the candidates now on it rather than an empty grid.
    if (!this.search.results.length && this.search.ids.length)
      this.search.loadFiltered({ page: this.search.page });
  }

  @modelAction
  private prepare(fileId: string, audioRange: { end: number; start: number } = null) {
    this.cancelLoad();
    this.setActiveFileId(fileId);
    this.setAudioRange(audioRange);
    this.setCandidates([]);
    this.setError("");
    this.setFilter(null);
    this.setHasMore(false);
    this.setNextOffset(0);
    this.search.reset();
    this.search.setForcePages(true);
    this.search.setPageSize(getConfig().file.similarity.defaultLimit);
    this.search.setPageCount(1);
    this.search.setPage(1);
    this.setIsOpen(true);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadSimilar = asyncAction(async ({ append = false, limit }: LoadSimilarArgs = {}) => {
    if (!this.activeFileId) throw new Error("No active file selected");

    this.setIsLoading(true);
    this.setError("");
    this.search.cancelLoad();

    const loadId = this.loadId + 1;
    const selectedIds = [...this.search.selectedIds];

    this.setLoadId(loadId);

    try {
      const args = {
        fileId: this.activeFileId,
        filter: this.filter,
        limit:
          limit ??
          Math.min(CONSTANTS.VECTOR.MAX_SIMILAR_RESULTS, Math.max(100, this.search.pageSize)),
        offset: append ? this.nextOffset : 0,
      };

      const res = this.audioRange
        ? await trpc.findSimilarAudio.mutate({
            ...args,
            end: this.audioRange.end,
            start: this.audioRange.start,
          })
        : await trpc.findSimilarFiles.mutate(args);

      if (loadId !== this.loadId) return;

      if (!res.success) throw new Error(res.error);

      const candidates = new Map(
        (append ? this.candidates : []).map((candidate) => [candidate.fileId, candidate]),
      );

      for (const candidate of res.data.candidates) candidates.set(candidate.fileId, candidate);

      const nextCandidates = [...candidates.values()].map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      }));

      this.search.setIds(nextCandidates.map((candidate) => candidate.fileId));

      if (this.search.ids.length) {
        const loaded = await this.search.loadFiltered({
          noCache: true,
          page: append ? this.search.page : 1,
          withFullCount: true,
        });

        if (!loaded.success) throw new Error(loaded.error);
      } else {
        this.search.setResults([]);
        this.search.setSelectedIds([]);
        this.search.setPageCount(0);
        this.search.setPage(1);
      }

      if (loadId !== this.loadId) return;

      this.setCandidates(nextCandidates);
      this.setHasMore(res.data.hasMore);
      this.setNextOffset(res.data.nextOffset);
      this.search.setSelectedIds(append ? selectedIds.filter((id) => candidates.has(id)) : []);
    } catch (err) {
      if (loadId === this.loadId) {
        this.search.setIds(this.candidates.map((candidate) => candidate.fileId));
        this.setError(err.message);
        toast.error("Similarity lookup failed");
      }
    } finally {
      if (loadId === this.loadId) this.setIsLoading(false);
    }
  });

  @modelFlow
  open = asyncAction(async (fileId: string) => {
    this.prepare(fileId);
    await this.loadSimilar();
  });

  @modelFlow
  openAudio = asyncAction(async (args: { end: number; fileId: string; start: number }) => {
    this.prepare(args.fileId, { end: args.end, start: args.start });
    await this.loadSimilar();
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get candidatesById() {
    return new Map(this.candidates.map((candidate) => [candidate.fileId, candidate]));
  }

  /** Opens audio matches in the carousel at the moment they matched. */
  @computed
  get carouselStartTimes() {
    return Object.fromEntries(
      this.candidates
        .filter((candidate) => candidate.start !== undefined)
        .map((candidate) => [candidate.fileId, candidate.start]),
    );
  }

  get resultIds() {
    return this.search.results.map((file) => file.id);
  }

  getCandidate(fileId: string) {
    return this.candidatesById.get(fileId);
  }
}
