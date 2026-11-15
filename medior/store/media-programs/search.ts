import { reaction } from "mobx";
import { ExtendedModel, model, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { _MediaProgramSearch } from "medior/store/_generated";
import { File, MediaProgram } from "medior/store";
import { asyncAction, loadFilesWithTags } from "medior/utils/client";
import { getConfig, rpc } from "medior/utils/server";
import type { FileContinuePoint } from "medior/utils/server/pot-player";

@model("medior/MediaProgramSearch")
export class MediaProgramSearch extends ExtendedModel(_MediaProgramSearch, {
  /** Each result's continue point, by program ID. */
  continuePoints: prop<Record<string, FileContinuePoint>>(() => ({}))
    .withTransform(objectToMapTransform<FileContinuePoint>())
    .withSetter(),
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
}) {
  /** PotPlayer saves bookmarks while Medior is in the background, so returning reads them again. */
  onAttachedToRootStore() {
    const handleFocus = () => this.reloadContinuePoints();

    window.addEventListener("focus", handleFocus);

    return () => window.removeEventListener("focus", handleFocus);
  }

  onInit() {
    super.onInit();

    reaction(
      () => this.results,
      () => {
        this.loadFiles();
        this.reloadContinuePoints();
      },
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /**
   * Loads where each result continues: of its episodes not watched in its current watch, the latest
   * PotPlayer bookmark of the one whose bookmarks were saved last.
   */
  @modelFlow
  loadContinuePoints = asyncAction(async () => {
    const loadId = this.loadId;
    const results = this.results;
    const episodeIds = new Map(
      results.map((program) => [
        program.id,
        program.episodeIds.filter((fileId) => !program.watchedIdSet.has(fileId)),
      ]),
    );
    // With Continue Watching off in Settings, no bookmarks are read.
    const fileIds = getConfig().mediaPrograms.continueWatching
      ? [...new Set([...episodeIds.values()].flat())]
      : [];

    if (!fileIds.length) this.setContinuePoints(new Map());
    else {
      const res = await rpc.listFileContinuePoints({ fileIds });
      if (!res.success) throw new Error(res.error);

      const fileContinuePoints = new Map(res.data.map((point) => [point.fileId, point]));
      const continuePoints = new Map<string, FileContinuePoint>();

      for (const [programId, programFileIds] of episodeIds) {
        const latest = programFileIds
          .map((fileId) => fileContinuePoints.get(fileId))
          .filter(Boolean)
          .reduce<FileContinuePoint>(
            (last, point) => (point.savedAt > (last?.savedAt ?? 0) ? point : last),
            null,
          );

        // Programs sharing an episode each get their own copy in the tree.
        if (latest) continuePoints.set(programId, { ...latest });
      }

      if (loadId === this.loadId && results === this.results)
        this.setContinuePoints(continuePoints);
    }
  });

  /** Loads each result's poster file, unless every poster is loaded already. */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const loadId = this.loadId;
    const results = this.results;
    const fileIds = [...new Set(results.map((program) => program.posterFileId).filter(Boolean))];

    if (!fileIds.length) this.setFiles(new Map());
    else if (!fileIds.every((fileId) => this.files.has(fileId))) {
      const files = await loadFilesWithTags(fileIds);

      if (loadId === this.loadId && results === this.results)
        this.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
    }
  });

  /** Continue points load in the background, where failing only leaves the cards without them. */
  async reloadContinuePoints() {
    const res = await this.loadContinuePoints();
    if (!res.success) console.error("Failed to load continue points:", res.error);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  /** The program's continue point, unless its episode was marked watched since it loaded. */
  getContinuePoint(program: MediaProgram) {
    const continuePoint = this.continuePoints.get(program.id);
    return continuePoint && !program.watchedIdSet.has(continuePoint.fileId) ? continuePoint : null;
  }
}
