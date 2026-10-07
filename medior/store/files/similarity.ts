import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, toast } from "medior/utils/client";
import { getConfig, trpc } from "medior/utils/server";
import { FileSearch } from "./search";

interface SimilarityCandidateMeta {
  fileId: string;
  rank: number;
  score: number;
}

@model("medior/FileSimilarityStore")
export class FileSimilarityStore extends Model({
  activeFileId: prop<string | null>(null).withSetter(),
  candidates: prop<SimilarityCandidateMeta[]>(() => []).withSetter(),
  error: prop<string>("").withSetter(),
  hasMore: prop<boolean>(false).withSetter(),
  isExact: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  loadedExact: prop<boolean>(false).withSetter(),
  nextOffset: prop<number>(0).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.setLoadId(this.loadId + 1);
    this.search.cancelLoad();

    if (this.isLoading) {
      this.search.setIds(this.candidates.map((candidate) => candidate.fileId));
      this.setIsExact(this.loadedExact);
    }

    this.setIsLoading(false);
  }

  @modelAction
  close() {
    this.cancelLoad();
    this.setIsOpen(false);
    this.setActiveFileId(null);
    this.setCandidates([]);
    this.setError("");
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

    if (this.isOpen && this.search.ids.length) this.search.loadFiltered();
  }

  @modelAction
  private prepare(fileId: string) {
    this.cancelLoad();
    this.setActiveFileId(fileId);
    this.setCandidates([]);
    this.setError("");
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
  loadSimilar = asyncAction(async (append = false) => {
    if (!this.activeFileId) throw new Error("No active file selected");

    this.setIsLoading(true);
    this.setError("");
    this.search.cancelLoad();

    const exact = this.isExact;
    const loadId = this.loadId + 1;
    const appendResults = append && exact === this.loadedExact;
    const selectedIds = [...this.search.selectedIds];

    this.setLoadId(loadId);

    try {
      const res = await trpc.findSimilarFiles.mutate({
        exact,
        fileId: this.activeFileId,
        limit: Math.min(1000, Math.max(100, this.search.pageSize)),
        offset: appendResults ? this.nextOffset : 0,
      });

      if (loadId !== this.loadId) return;

      if (!res.success) throw new Error(res.error);

      const candidates = new Map(
        (appendResults ? this.candidates : []).map((candidate) => [candidate.fileId, candidate]),
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
          page: appendResults ? this.search.page : 1,
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
      this.setLoadedExact(exact);
      this.setNextOffset(res.data.nextOffset);
      this.search.setSelectedIds(
        appendResults ? selectedIds.filter((id) => candidates.has(id)) : [],
      );
    } catch (err) {
      if (loadId === this.loadId) {
        this.search.setIds(this.candidates.map((candidate) => candidate.fileId));
        this.setIsExact(this.loadedExact);
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

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get candidatesById() {
    return new Map(this.candidates.map((candidate) => [candidate.fileId, candidate]));
  }

  get resultIds() {
    return this.search.results.map((file) => file.id);
  }

  getCandidate(fileId: string) {
    return this.candidatesById.get(fileId);
  }
}
