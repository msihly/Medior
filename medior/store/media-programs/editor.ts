import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { FileSearch, TagOption } from "medior/store";
import { asyncAction, derefMobx, openCarouselWindow } from "medior/utils/client";
import {
  chunkArray,
  getMediaProgramMetaSeasonNumbers,
  getMediaProgramSeasonOutlines,
  getMissingEpisodeKey,
  getMissingMediaProgramSeasons,
  getSeasonEpisodeNumbers,
  isDeepEqual,
  makeTagSelector,
  MediaProgramMissingMark,
  MediaProgramSeason,
  MediaProgramSeasonInput,
  moveSeasonEpisodes,
  numberSeasonEpisodes,
  numberSeasonEpisodesFromNames,
  parseSeasonNumber,
} from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { MediaProgram } from ".";

/** Copies a season out of the program, so the update never reuses its tree nodes. */
const toSeasonInput = (season: MediaProgramSeason): MediaProgramSeasonInput => ({
  episodeNumbers: { ...season.episodeNumbers },
  fileIds: [...season.fileIds],
  id: season.id,
  label: season.label,
  number: season.number,
  rating: season.rating,
  ratingIsManual: season.ratingIsManual,
});

@model("medior/MediaProgramEditorStore")
export class MediaProgramEditorStore extends Model({
  /** A season the metadata source lists without files, shown while no season of the program is. */
  activeMissingSeasonNumber: prop<number>(null).withSetter(),
  activeSeasonId: prop<string>(null).withSetter(),
  /** The Genres modal's edits, kept here so tag merges and deletions reach them. */
  genres: prop<TagOption[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isSaving: prop<boolean>(false).withSetter(),
  program: prop<MediaProgram>(null).withSetter(),
  search: prop<FileSearch>(() => new FileSearch({})),
  /** Numbers of the shown season's episodes without files, chosen to be marked. */
  selectedMissingNumbers: prop<number[]>(() => []).withSetter(),
  /** Seasons chosen with Ctrl or Shift, which act together with the active season. */
  selectedSeasonIds: prop<string[]>(() => []).withSetter(),
}) {
  private loadRevision = 0;
  /** The episode without a file clicked last, where a Shift click's range starts. */
  private missingAnchor: number = null;

  onInit() {
    autoBind(this);

    // Deselecting every episode with a file deselects those without one too.
    reaction(
      () => this.search.selectedIds.length,
      (count) => {
        if (!count) this.setSelectedMissingNumbers([]);
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelLoad() {
    this.loadRevision++;
    this.isLoading = false;
    this.search.cancelLoad();
  }

  /**
   * Ctrl adds or removes a season, and Shift chooses every season from the active one to it.
   * Neither changes which season's episodes show.
   */
  @modelAction
  chooseSeason({ hasShift, id }: { hasShift: boolean; id: string }) {
    if (hasShift) {
      const index = this.seasons.findIndex((season) => season.id === id);
      const anchor = this.activeSeasonIndex < 0 ? index : this.activeSeasonIndex;

      this.selectedSeasonIds = this.seasons
        .slice(Math.min(anchor, index), Math.max(anchor, index) + 1)
        .map((season) => season.id);
    } else if (this.selectedSeasonIds.includes(id))
      this.selectedSeasonIds = this.selectedSeasonIds.filter((cur) => cur !== id);
    else this.selectedSeasonIds = [...this.selectedSeasonIds, id];
  }

  /**
   * A click adds or removes an episode without a file, and Shift adds every one between the last
   * clicked and it.
   */
  @modelAction
  selectMissingEpisode({ hasShift, number }: { hasShift: boolean; number: number }) {
    const anchor = this.selectedMissingNumbers.length ? this.missingAnchor : null;

    if (hasShift && anchor !== null) {
      const [low, high] = [Math.min(anchor, number), Math.max(anchor, number)];
      const range = this.missingEpisodes
        .map((episode) => episode.number)
        .filter((cur) => cur >= low && cur <= high);

      this.selectedMissingNumbers = [...new Set([...this.selectedMissingNumbers, ...range])];
    } else if (this.selectedMissingNumbers.includes(number))
      this.selectedMissingNumbers = this.selectedMissingNumbers.filter((cur) => cur !== number);
    else this.selectedMissingNumbers = [...this.selectedMissingNumbers, number];

    this.missingAnchor = number;
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    this.cancelLoad();
    this.isOpen = isOpen;

    if (!isOpen) {
      this.activeMissingSeasonNumber = null;
      this.activeSeasonId = null;
      this.program = null;
      this.selectedMissingNumbers = [];
      this.selectedSeasonIds = [];
    }

    this.search.reset();
  }

  @modelAction
  updateProgram(updates: Partial<ModelCreationData<MediaProgram>>) {
    this.program?.update(updates);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Adds an empty season and shows it. */
  @modelFlow
  addSeason = asyncAction(async (label: string) => {
    const existingIds = new Set(this.seasons.map((season) => season.id));

    const res = await this.saveSeasons([
      ...this.seasons.map(toSeasonInput),
      {
        episodeNumbers: {},
        fileIds: [],
        label,
        number: parseSeasonNumber(label),
        rating: 0,
        ratingIsManual: false,
      },
    ]);
    if (!res.success) throw new Error(res.error);

    const added = this.seasons.find((season) => !existingIds.has(season.id));

    if (added) {
      this.setActiveSeasonId(added.id);

      const loaded = await this.loadEpisodes();
      if (!loaded.success) throw new Error(loaded.error);
    }
  });

  /** Copies each collection's episodes into a new season; the collections stay as they are. */
  @modelFlow
  copyCollections = asyncAction(async (collectionIds: string[]) => {
    const res = await rpc.copyCollectionsToMediaProgram({ collectionIds, id: this.program.id });
    if (!res.success) throw new Error(res.error);

    const reloaded = await this.reloadSeasons();
    if (!reloaded.success) throw new Error(reloaded.error);
  });

  /**
   * Shows the active season's episodes. A reload keeps the page and the selected episodes that are
   * still in the season.
   */
  @modelFlow
  loadEpisodes = asyncAction(async ({ isReload = false }: { isReload?: boolean } = {}) => {
    const revision = this.loadRevision;
    const fileIds = this.activeSeason?.fileIds ?? [];
    const fileIdSet = new Set(fileIds);

    this.search.setForcePages(true);
    this.search.setIds([...fileIds]);
    this.search.setSelectedIds(
      isReload ? this.search.selectedIds.filter((id) => fileIdSet.has(id)) : [],
    );

    if (!isReload) this.setSelectedMissingNumbers([]);

    if (!fileIds.length) {
      this.search.setResults([]);
      this.search.setPage(1);
      this.search.setPageCount(1);
    } else {
      const res = await this.search.loadFiltered({
        noCache: true,
        page: isReload ? this.search.page : 1,
        withFullCount: true,
      });

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

      const tagsRes = await rpc.listTag({
        filter: { id: [...program.genreIds, ...program.tagIds] },
      });
      if (revision !== this.loadRevision) return false;
      if (!tagsRes.success) throw new Error(tagsRes.error);

      const selectTags = makeTagSelector(tagsRes.data);

      this.setProgram(
        new MediaProgram({
          ...program,
          genres: selectTags(program.genreIds),
          tags: selectTags(program.tagIds),
        }),
      );
      this.setSelectedSeasonIds([]);

      if (!this.activeSeason && !this.activeMissingSeason)
        this.setActiveSeasonId(this.nextEpisodeSeasonId ?? this.seasons[0]?.id ?? null);

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

  /** Marks the chosen episodes without files watched or skipped, or clears their marks. */
  @modelFlow
  markMissingEpisodes = asyncAction(async (mark: MediaProgramMissingMark | null) => {
    const marks = { ...derefMobx(this.program.missingMarks ?? {}) };

    for (const number of this.selectedMissingNumbers) {
      const key = getMissingEpisodeKey(this.activeSourceSeasonNumber, number);

      if (mark) marks[key] = mark;
      else delete marks[key];
    }

    const res = await rpc.updateMediaProgram({
      id: this.program.id,
      updates: { missingMarks: marks },
    });
    if (!res.success) throw new Error(res.error);

    this.updateProgram(res.data);
  });

  /**
   * Moves the selected episodes up to `delta` numbers earlier or later within the active season,
   * into missing numbers or past the episodes in the way.
   */
  @modelFlow
  moveEpisodes = asyncAction(async ({ delta, down }: { delta: number; down: boolean }) => {
    const selectedIds = new Set(this.search.selectedIds);

    const res = await this.saveSeasons(
      this.seasons.map((season) =>
        season.id === this.activeSeasonId
          ? {
              ...toSeasonInput(season),
              ...moveSeasonEpisodes(season, (id) => selectedIds.has(id), { delta, down }),
            }
          : toSeasonInput(season),
      ),
    );
    if (!res.success) throw new Error(res.error);
  });

  /** Moves the selected episodes from the active season to the end of another. */
  @modelFlow
  moveEpisodesToSeason = asyncAction(async (seasonId: string) => {
    const selectedIds = this.search.selectedIds.filter((id) =>
      this.activeSeason.fileIds.includes(id),
    );
    const selectedIdSet = new Set(selectedIds);

    const res = await this.saveSeasons(
      this.seasons.map((season) => ({
        ...toSeasonInput(season),
        fileIds:
          season.id === this.activeSeasonId
            ? season.fileIds.filter((id) => !selectedIdSet.has(id))
            : season.id === seasonId
              ? [...season.fileIds.filter((id) => !selectedIdSet.has(id)), ...selectedIds]
              : [...season.fileIds],
      })),
    );
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  moveSeason = asyncAction(async ({ down, id }: { down: boolean; id: string }) => {
    const seasons = this.seasons.map(toSeasonInput);
    const index = seasons.findIndex((season) => season.id === id);
    const newIndex = down ? index + 1 : index - 1;

    if (index < 0 || newIndex < 0 || newIndex >= seasons.length) return;

    [seasons[index], seasons[newIndex]] = [seasons[newIndex], seasons[index]];

    const res = await this.saveSeasons(seasons);
    if (!res.success) throw new Error(res.error);
  });

  /** Numbers the selected episodes up from the first number, moving those in the way past them. */
  @modelFlow
  numberEpisodes = asyncAction(async (firstNumber: number) => {
    const selectedIds = new Set(this.search.selectedIds);

    const res = await this.saveSeasons(
      this.seasons.map((season) =>
        season.id === this.activeSeasonId
          ? {
              ...toSeasonInput(season),
              ...numberSeasonEpisodes(season, (id) => selectedIds.has(id), firstNumber),
            }
          : toSeasonInput(season),
      ),
    );
    if (!res.success) throw new Error(res.error);
  });

  /**
   * Numbers the selected episodes by the numbers their names give less the offset, moving those in
   * the way past them.
   */
  @modelFlow
  numberEpisodesFromNames = asyncAction(async (offset: number) => {
    const selectedIds = new Set(this.search.selectedIds);
    const fileNames = new Map<string, string>();

    for (const fileIds of chunkArray([...selectedIds], 1000)) {
      const res = await rpc.listFileReingestMetadata({ fileIds });
      if (!res.success) throw new Error(res.error);

      for (const file of res.data) fileNames.set(file.id, file.originalName);
    }

    const res = await this.saveSeasons(
      this.seasons.map((season) =>
        season.id === this.activeSeasonId
          ? {
              ...toSeasonInput(season),
              ...numberSeasonEpisodesFromNames(season, fileNames, offset),
            }
          : toSeasonInput(season),
      ),
    );
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

  /** Rates a season by hand; clearing its rating returns it to its episodes' average. */
  @modelFlow
  rateSeason = asyncAction(async ({ id, rating }: { id: string; rating: number }) => {
    const res = await this.saveSeasons(
      this.seasons.map((season) =>
        season.id === id
          ? { ...toSeasonInput(season), rating, ratingIsManual: rating > 0 }
          : toSeasonInput(season),
      ),
    );
    if (!res.success) throw new Error(res.error);
  });

  /** Loads the program as saved, such as after its season updates were missed. */
  @modelFlow
  reloadSeasons = asyncAction(async () => {
    const res = await rpc.listMediaProgram({ args: { filter: { id: this.program.id } } });
    if (!res.success) throw new Error(res.error);

    const program = res.data.items[0];
    if (!program) throw new Error("Media program no longer exists.");

    this.updateProgram(program);

    const synced = await this.syncSeasons();
    if (!synced.success) throw new Error(synced.error);
  });

  /** Removes the selected episodes from the active season; their files stay in the library. */
  @modelFlow
  removeEpisodes = asyncAction(async () => {
    const selectedIds = new Set(this.search.selectedIds);

    const res = await this.saveSeasons(
      this.seasons.map((season) => ({
        ...toSeasonInput(season),
        fileIds:
          season.id === this.activeSeasonId
            ? season.fileIds.filter((id) => !selectedIds.has(id))
            : [...season.fileIds],
      })),
    );
    if (!res.success) throw new Error(res.error);
  });

  /** Removes the season from the program; its files stay in the library. */
  @modelFlow
  removeSeason = asyncAction(async (id: string) => {
    const res = await this.saveSeasons(
      this.seasons.filter((season) => season.id !== id).map(toSeasonInput),
    );
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  renameSeason = asyncAction(async ({ id, label }: { id: string; label: string }) => {
    const res = await this.saveSeasons(
      this.seasons.map((season) =>
        season.id === id
          ? { ...toSeasonInput(season), label, number: parseSeasonNumber(label) }
          : toSeasonInput(season),
      ),
    );
    if (!res.success) throw new Error(res.error);
  });

  /**
   * Saves seasons edited from the loaded ones. When the saved seasons changed meanwhile, the
   * program reloads instead, so the next edit starts from the latest seasons.
   */
  @modelFlow
  saveSeasons = asyncAction(async (seasons: MediaProgramSeasonInput[]) => {
    this.setIsSaving(true);

    try {
      const res = await rpc.updateMediaProgram({
        expectedSeasons: getMediaProgramSeasonOutlines(this.seasons),
        id: this.program.id,
        updates: { seasons },
      });

      if (!res.success) {
        await this.reloadSeasons();

        throw new Error(res.error);
      }

      this.updateProgram(res.data);

      const synced = await this.syncSeasons();
      if (!synced.success) throw new Error(synced.error);
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

  /** Marks every episode in the seasons watched or unwatched at once. */
  @modelFlow
  setSeasonsWatched = asyncAction(
    async ({ ids, isWatched }: { ids: string[]; isWatched: boolean }) => {
      const fileIds = this.seasons
        .filter((season) => ids.includes(season.id))
        .flatMap((season) => season.fileIds.map(String));

      const res = await this.setEpisodesWatched({ fileIds: [...new Set(fileIds)], isWatched });
      if (!res.success) throw new Error(res.error);
    },
  );

  /**
   * Follows season changes made here or elsewhere: a removed active season, or a missing one that
   * gained files, gives way to the next episode's season, and changed episodes reload in place.
   * Chosen episodes without files stay chosen only while they still have none.
   */
  @modelFlow
  syncSeasons = asyncAction(async () => {
    if (!this.program) return;

    const missingNumbers = new Set(this.missingEpisodes.map((episode) => episode.number));
    this.setSelectedMissingNumbers(
      this.selectedMissingNumbers.filter((number) => missingNumbers.has(number)),
    );

    if (!this.activeSeason && !this.activeMissingSeason) {
      this.setActiveSeasonId(this.nextEpisodeSeasonId ?? this.seasons[0]?.id ?? null);

      const loaded = await this.loadEpisodes();
      if (!loaded.success) throw new Error(loaded.error);
    } else if (
      this.activeSeason &&
      !isDeepEqual([...this.activeSeason.fileIds], [...this.search.ids])
    ) {
      const loaded = await this.loadEpisodes({ isReload: true });
      if (!loaded.success) throw new Error(loaded.error);
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  /** The active season's episode numbers by file. */
  @computed
  get activeEpisodeNumbers() {
    const season = this.activeSeason;
    const numbers = season ? getSeasonEpisodeNumbers(season) : [];

    return new Map(numbers.map((number, index) => [season.fileIds[index], number]));
  }

  /** The missing season shown, which a season of the program being shown replaces. */
  @computed
  get activeMissingSeason() {
    return this.activeSeason
      ? null
      : this.missingSeasons.find((season) => season.number === this.activeMissingSeasonNumber);
  }

  @computed
  get activeSeason() {
    return this.seasons.find((season) => season.id === this.activeSeasonId);
  }

  @computed
  get activeSeasonIndex() {
    return this.seasons.findIndex((season) => season.id === this.activeSeasonId);
  }

  /** The metadata source's number for the shown season, which keys its missing episodes' marks. */
  @computed
  get activeSourceSeasonNumber() {
    return this.activeSeason
      ? getMediaProgramMetaSeasonNumbers(this.seasons)[this.activeSeasonIndex]
      : (this.activeMissingSeason?.number ?? null);
  }

  @computed
  get episodeIds() {
    return this.program?.episodeIds ?? [];
  }

  /**
   * The shown season's episodes the metadata source lists without files: those at numbers no file
   * of the active season has, or every episode of a missing season.
   */
  @computed
  get missingEpisodes() {
    const numbers = new Set(this.activeEpisodeNumbers.values());

    if (this.activeSeason)
      return (this.activeSeason.meta?.episodes ?? []).filter(
        (episode) => !numbers.has(episode.number),
      );
    else return this.activeMissingSeason?.episodes ?? [];
  }

  @computed
  get missingSeasons() {
    return getMissingMediaProgramSeasons(this.program?.meta, this.seasons);
  }

  /** The first unwatched episode, or the first episode once every one is watched. */
  @computed
  get nextEpisodeId() {
    const watchedIds = this.program?.watchedIdSet;

    return this.episodeIds.find((id) => !watchedIds?.has(id)) ?? this.episodeIds[0];
  }

  @computed
  get nextEpisodeSeasonId() {
    return this.seasons.find((season) => season.fileIds.includes(this.nextEpisodeId))?.id;
  }

  /**
   * The page's episodes in number order with the missing ones among them: those after the previous
   * page's last episode, up to this page's last or, on the last page, every one after it.
   */
  @computed
  get pageEpisodes() {
    const fileIds = this.activeSeason?.fileIds ?? [];
    const results = this.search.results;
    const pageOffset = (this.search.page - 1) * this.search.pageSize;

    const lowerNumber = pageOffset > 0 ? this.activeEpisodeNumbers.get(fileIds[pageOffset - 1]) : 0;
    const upperNumber =
      this.search.page >= this.search.pageCount
        ? Infinity
        : this.activeEpisodeNumbers.get(fileIds[pageOffset + results.length - 1]);

    return [
      ...results.map((file) => ({ file, number: this.activeEpisodeNumbers.get(file.id) })),
      ...this.missingEpisodes
        .filter((episode) => episode.number > lowerNumber && episode.number <= upperNumber)
        .map((episode) => ({ episode, number: episode.number })),
    ].sort((a, b) => a.number - b.number);
  }

  @computed
  get seasons() {
    return this.program?.seasons ?? [];
  }

  /** The active season with those chosen alongside it, which season actions apply to. */
  @computed
  get selectedSeasonIdSet() {
    const seasonIds = new Set(this.seasons.map((season) => season.id));

    return new Set(
      [this.activeSeasonId, ...this.selectedSeasonIds].filter((id) => seasonIds.has(id)),
    );
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  /** The source's details for the active season's episode at the file's number. */
  getEpisodeMeta(fileId: string) {
    const number = this.activeEpisodeNumbers.get(fileId);

    return number
      ? this.activeSeason.meta?.episodes.find((episode) => episode.number === number)
      : null;
  }

  /** The mark on the shown season's episode without a file, if it has one. */
  getMissingMark(episodeNumber: number) {
    const key = getMissingEpisodeKey(this.activeSourceSeasonNumber, episodeNumber);
    return this.program?.missingMarks?.[key] ?? null;
  }

  getWatchedCount(season: MediaProgramSeason) {
    return season.fileIds.filter((fileId) => this.program?.watchedIdSet.has(fileId)).length;
  }
}
