import autoBind from "auto-bind";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, toast } from "medior/utils/client";
import { getConfig, trpc } from "medior/utils/server";
import { File } from "./file";
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
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  limit: prop<number>(() => getConfig().file.similarity.defaultLimit).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  close() {
    this.setIsOpen(false);
    this.setActiveFileId(null);
    this.setCandidates([]);
    this.setError("");
    this.search.reset();
  }

  @modelAction
  private prepare(fileId: string) {
    this.setActiveFileId(fileId);
    this.setCandidates([]);
    this.setError("");
    this.search.reset();
    this.search.setPageSize(this.limit);
    this.search.setPageCount(1);
    this.search.setPage(1);
    this.setIsOpen(true);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadSimilar = asyncAction(async () => {
    if (!this.activeFileId) throw new Error("No active file selected");

    this.setIsLoading(true);
    this.setError("");

    try {
      const res = await trpc.findSimilarFiles.mutate({
        fileId: this.activeFileId,
        limit: this.limit,
      });
      if (!res.success) throw new Error(res.error);

      this.setCandidates(res.data.candidates);
      this.search.setResults(res.data.items.map((file) => new File(file)));
      this.search.setSelectedIds([]);
    } catch (err) {
      this.setCandidates([]);
      this.search.setResults([]);
      this.setError(err.message);
      toast.error("Similarity lookup failed");
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  open = asyncAction(async (fileId: string) => {
    this.prepare(fileId);
    await this.loadSimilar();
  });

  /* --------------------------------- GETTERS -------------------------------- */
  get resultIds() {
    return this.search.results.map((file) => file.id);
  }

  getCandidate(fileId: string) {
    return this.candidates.find((candidate) => candidate.fileId === fileId);
  }
}
