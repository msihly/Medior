import { reaction } from "mobx";
import { ExtendedModel, model, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { _MediaProgramSearch } from "medior/store/_generated";
import { File } from "medior/store";
import { asyncAction, loadFilesWithTags } from "medior/utils/client";

@model("medior/MediaProgramSearch")
export class MediaProgramSearch extends ExtendedModel(_MediaProgramSearch, {
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
}) {
  onInit() {
    super.onInit();

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
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
}
