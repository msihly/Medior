import autoBind from "auto-bind";
import { computed } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { FileCollection, FileSearch, TagOption, tagToOption } from "medior/store";
import { asyncAction, openCarouselWindow } from "medior/utils/client";
import { makeTagSelector } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { MediaProgram } from ".";

type MediaProgramDraft = Pick<
  MediaProgramEditorStore,
  "genres" | "language" | "medium" | "name" | "type" | "year"
>;

@model("medior/MediaProgramEditorStore")
export class MediaProgramEditorStore extends Model({
  activeSeasonId: prop<string>(null).withSetter(),
  genres: prop<TagOption[]>(() => []).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isSaving: prop<boolean>(false).withSetter(),
  language: prop<string>(null),
  medium: prop<string>(null),
  name: prop<string>(""),
  program: prop<MediaProgram>(null).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
  seasons: prop<FileCollection[]>(() => []).withSetter(),
  type: prop<string>(null),
  year: prop<number>(null),
}) {
  private loadRevision = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.loadRevision++;
    this.isLoading = false;
    this.search.cancelLoad();
  }

  @modelAction
  resetDraft() {
    this.genres = this.program?.genres.map(tagToOption) ?? [];
    this.hasUnsavedChanges = false;
    this.language = this.program?.language ?? null;
    this.medium = this.program?.medium ?? null;
    this.name = this.program?.name ?? "";
    this.type = this.program?.type ?? null;
    this.year = this.program?.year ?? null;
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.cancelLoad();
    this.isOpen = isOpen;

    if (!isOpen) {
      this.activeSeasonId = null;
      this.program = null;
      this.seasons = [];
      this.resetDraft();
    }

    this.search.reset();
  }

  @modelAction
  updateDraft(updates: Partial<MediaProgramDraft>) {
    Object.assign(this, updates);
    this.hasUnsavedChanges = true;
  }

  @modelAction
  updateProgram(updates: Partial<ModelCreationData<MediaProgram>>) {
    this.program?.update(updates);
  }

  /**
   * Updates a season in place. The active season's loaded episodes drop removed files, and the
   * changed episode list marks the search as changed instead of reloading the episodes.
   */
  @modelAction
  updateSeason(id: string, updates: Partial<ModelCreationData<FileCollection>>) {
    const season = this.seasons.find((current) => current.id === id);
    if (!season) return;

    season.update(updates);

    if (id === this.activeSeasonId && updates.fileIdIndexes) {
      const fileIds = season.sortedFileIds;
      const remainingIds = new Set(fileIds);

      this.search.removeFiles(this.search.ids.filter((fileId) => !remainingIds.has(fileId)));
      this.search.setIds(fileIds);
    }
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  addSeasons = asyncAction(async (collectionIds: string[]) => {
    const existingIds = new Set(this.program.collectionIdIndexes.map((c) => c.collectionId));
    const lastIndex = Math.max(-1, ...this.program.collectionIdIndexes.map((c) => c.index));

    const res = await this.saveSeasons([
      ...this.program.collectionIdIndexes,
      ...collectionIds
        .filter((collectionId) => !existingIds.has(collectionId))
        .map((collectionId, index) => ({ collectionId, index: lastIndex + 1 + index })),
    ]);
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  loadEpisodes = asyncAction(async () => {
    const revision = this.loadRevision;
    const fileIds = this.activeSeason?.sortedFileIds;

    this.search.setForcePages(true);
    this.search.setIds(fileIds ?? []);
    this.search.setSelectedIds([]);

    if (!fileIds?.length) this.search.setResults([]);
    else {
      const res = await this.search.loadFiltered({ noCache: true, page: 1, withFullCount: true });

      if (revision === this.loadRevision && !res.success) throw new Error(res.error);
    }
  });

  @modelFlow
  loadProgram = asyncAction(async (id: string) => {
    this.cancelLoad();

    const revision = this.loadRevision;

    this.setIsLoading(true);

    try {
      const res = await rpc.listMediaProgram({ args: { filter: { id } } });
      if (revision !== this.loadRevision) return false;
      if (!res.success) throw new Error(res.error);

      const program = res.data.items[0];
      if (!program) throw new Error("Media program no longer exists.");

      const [collectionsRes, tagsRes] = await Promise.all([
        rpc.listFileCollection({
          args: { filter: { id: program.collectionIdIndexes.map((c) => c.collectionId) } },
        }),
        rpc.listTag({ filter: { id: [...program.genreIds, ...program.tagIds] } }),
      ]);

      if (revision !== this.loadRevision) return false;

      if (!collectionsRes.success) throw new Error(collectionsRes.error);

      if (!tagsRes.success) throw new Error(tagsRes.error);

      const collectionsById = new Map(collectionsRes.data.items.map((c) => [c.id, c]));
      const selectTags = makeTagSelector(tagsRes.data);
      const seasons = [...program.collectionIdIndexes]
        .sort((a, b) => a.index - b.index)
        .map(({ collectionId }) => collectionsById.get(collectionId))
        .filter(Boolean)
        .map((collection) => new FileCollection(collection));

      const isSameProgram = this.program?.id === id;

      this.setProgram(
        new MediaProgram({
          ...program,
          genres: selectTags(program.genreIds),
          tags: selectTags(program.tagIds),
        }),
      );

      if (!isSameProgram || !this.hasUnsavedChanges) this.resetDraft();

      this.setSeasons(seasons);

      if (!seasons.some((season) => season.id === this.activeSeasonId))
        this.setActiveSeasonId(this.nextEpisodeSeasonId ?? seasons[0]?.id ?? null);

      const loaded = await this.loadEpisodes();

      if (!loaded.success) throw new Error(loaded.error);

      return true;
    } catch (error) {
      if (revision === this.loadRevision) throw error;

      return false;
    } finally {
      if (revision === this.loadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  moveSeason = asyncAction(async ({ down, id }: { down: boolean; id: string }) => {
    const ids = this.seasons.map((season) => season.id);
    const index = ids.indexOf(id);
    const newIndex = down ? index + 1 : index - 1;

    if (index < 0 || newIndex < 0 || newIndex >= ids.length) return;

    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];

    const res = await this.saveSeasons(ids.map((collectionId, index) => ({ collectionId, index })));
    if (!res.success) throw new Error(res.error);
  });

  /** Opens the carousel on every episode in order, starting from the given or next episode. */
  @modelFlow
  play = asyncAction(async (fileId?: string) => {
    const episodeIds = this.episodeIds;
    const activeId = fileId ?? this.nextEpisodeId;

    if (!activeId) throw new Error("This program has no episodes.");

    const res = await rpc.listFile({ args: { filter: { id: activeId } } });

    if (!res.success) throw new Error(res.error);

    const file = res.data.items[0];

    if (!file) throw new Error("Episode no longer exists.");

    openCarouselWindow({ file, selectedFileIds: episodeIds });
  });

  @modelFlow
  removeSeason = asyncAction(async (id: string) => {
    const res = await this.saveSeasons(
      this.program.collectionIdIndexes.filter(({ collectionId }) => collectionId !== id),
    );
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  saveProgram = asyncAction(async () => {
    if (!this.name.trim()) throw new Error("A name is required.");

    this.setIsSaving(true);

    try {
      const res = await rpc.updateMediaProgram({
        id: this.program.id,
        updates: {
          genreIds: this.genres.map((genre) => genre.id),
          language: this.language,
          medium: this.medium,
          name: this.name,
          type: this.type,
          year: this.year,
        },
      });

      if (!res.success) throw new Error(res.error);

      // Genres changed elsewhere arrive through sockets, which load their tags into the program.
      this.updateProgram(res.data);
      this.setHasUnsavedChanges(false);
    } finally {
      this.setIsSaving(false);
    }
  });

  @modelFlow
  saveSeasons = asyncAction(async (collectionIdIndexes: MediaProgram["collectionIdIndexes"]) => {
    this.setIsSaving(true);

    try {
      const res = await rpc.updateMediaProgram({
        id: this.program.id,
        updates: { collectionIdIndexes },
      });
      if (!res.success) throw new Error(res.error);

      // The seasons update through sockets, keeping the loaded episodes and their page.
      this.updateProgram(res.data);
    } finally {
      this.setIsSaving(false);
    }
  });

  @modelFlow
  setEpisodesWatched = asyncAction(
    async ({ fileIds, isWatched }: { fileIds: string[]; isWatched: boolean }) => {
      const res = await rpc.setMediaProgramEpisodesWatched({
        fileIds,
        id: this.program.id,
        isWatched,
      });

      if (!res.success) throw new Error(res.error);

      this.updateProgram(res.data);
    },
  );

  /**
   * Loads the program's seasons after they were changed elsewhere. The loaded episodes stay
   * unless their season was removed.
   */
  @modelFlow
  syncSeasons = asyncAction(async () => {
    const revision = this.loadRevision;
    const collectionIdIndexes = [...this.program.collectionIdIndexes].sort(
      (a, b) => a.index - b.index,
    );
    const collectionIds = collectionIdIndexes.map(({ collectionId }) => collectionId);
    const res = collectionIds.length
      ? await rpc.listFileCollection({ args: { filter: { id: collectionIds } } })
      : null;

    if (revision !== this.loadRevision) return;

    if (res && !res.success) throw new Error(res.error);

    const collectionsById = new Map((res?.data.items ?? []).map((c) => [c.id, c]));
    const seasons = collectionIds
      .map((collectionId) => collectionsById.get(collectionId))
      .filter(Boolean)
      .map((collection) => new FileCollection(collection));

    this.setSeasons(seasons);

    if (!seasons.some((season) => season.id === this.activeSeasonId)) {
      this.setActiveSeasonId(this.nextEpisodeSeasonId ?? seasons[0]?.id ?? null);

      const loaded = await this.loadEpisodes();

      if (!loaded.success) throw new Error(loaded.error);
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeSeason() {
    return this.seasons.find((season) => season.id === this.activeSeasonId);
  }

  /** Every episode in season order; a file in several seasons plays once. */
  @computed
  get episodeIds() {
    return [...new Set(this.seasons.flatMap((season) => season.sortedFileIds))];
  }

  /** The first unwatched episode, or the first episode once every one is watched. */
  @computed
  get nextEpisodeId() {
    const watchedIds = this.program?.watchedIdSet;

    return this.episodeIds.find((id) => !watchedIds?.has(id)) ?? this.episodeIds[0];
  }

  @computed
  get nextEpisodeSeasonId() {
    return this.seasons.find((season) =>
      season.fileIdIndexes.some(({ fileId }) => fileId === this.nextEpisodeId),
    )?.id;
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getWatchedCount(season: FileCollection) {
    return season.fileIdIndexes.filter(({ fileId }) => this.program?.watchedIdSet.has(fileId))
      .length;
  }
}
