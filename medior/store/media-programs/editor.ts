import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import {
  getRootStore,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { SortMenuProps } from "medior/components";
import { FileSearch, HomeView, RootStore, TagOption } from "medior/store";
import { asyncAction, derefMobx, openCarouselWindow } from "medior/utils/client";
import {
  chunkArray,
  countMissingEpisodes,
  getMediaProgramMetaSeasonNumbers,
  getMediaProgramSeasonOutlines,
  getMissingEpisodeKey,
  getMissingMediaProgramSeasons,
  getSeasonEpisodeNumbers,
  getSeasonMissingEpisodes,
  isDeepEqual,
  makeEpisodeLabel,
  makeTagSelector,
  MediaProgramEpisodeLabels,
  MediaProgramMissingMark,
  MediaProgramSeason,
  MediaProgramSeasonInput,
  moveSeasonEpisodes,
  numberSeasonEpisodes,
  numberSeasonEpisodesFromNames,
  parseSeasonNumber,
  splitSeasonsByFileNames,
} from "medior/utils/common";
import { getConfig, rpc } from "medior/utils/server";
import { MediaProgram } from ".";

/** Episodes without files take part in selection under IDs no file has. */
const MISSING_ID_PREFIX = "missing:";

/** The files' names by their IDs, read in chunks. */
const listFileNames = async (fileIds: string[]) => {
  const fileNames = new Map<string, string>();

  for (const chunk of chunkArray(fileIds, 1000)) {
    const res = await rpc.listFileReingestMetadata({ fileIds: chunk });
    if (!res.success) throw new Error(res.error);

    for (const file of res.data) fileNames.set(file.id, file.originalName);
  }

  return fileNames;
};

const toMissingId = (number: number) => `${MISSING_ID_PREFIX}${number}`;

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
  /** How episodes are labeled, as EP ## or with their season as S##E##. */
  episodeLabels: prop<MediaProgramEpisodeLabels>(
    () => getConfig().mediaPrograms.episodes.labels,
  ).withSetter(),
  /** The order episodes show in, which leaves their numbers alone. */
  episodeSort: prop<SortMenuProps["value"]>(
    () => getConfig().mediaPrograms.episodes.sort,
  ).withSetter(),
  /** The Genres modal's edits, kept here so tag merges and deletions reach them. */
  genres: prop<TagOption[]>(() => []).withSetter(),
  /** The view the editor opened over, where it waits while another view shows. */
  homeView: prop<HomeView>(null),
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
  /** Each episode load, so a slower one for an earlier season or sort never replaces a later one. */
  private episodesRevision = 0;
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

  /** Opening starts from the default episode labels and order in Settings. */
  @modelAction
  setIsOpen(isOpen: boolean) {
    const stores = getRootStore<RootStore>(this);

    // Asked to open again, the editor shows the view it waits in.
    if (isOpen && this.isOpen) stores.home.openView(this.homeView);
    else if (isOpen) this.homeView = stores.home.view;

    this.cancelLoad();
    this.isOpen = isOpen;

    if (isOpen) {
      this.episodeLabels = getConfig().mediaPrograms.episodes.labels;
      this.episodeSort = getConfig().mediaPrograms.episodes.sort;
    } else {
      this.activeMissingSeasonNumber = null;
      this.activeSeasonId = null;
      this.program = null;
      this.selectedMissingNumbers = [];
      this.selectedSeasonIds = [];
    }

    this.search.reset();
  }

  /** Selects or deselects episodes with or without files by their selection IDs. */
  @modelAction
  toggleEpisodesSelected(selected: { id: string; isSelected: boolean }[]) {
    const isMissing = ({ id }: { id: string }) => id.startsWith(MISSING_ID_PREFIX);
    const missingNumbers = new Set(this.selectedMissingNumbers);

    for (const { id, isSelected } of selected.filter(isMissing)) {
      const number = Number(id.slice(MISSING_ID_PREFIX.length));

      if (isSelected) missingNumbers.add(number);
      else missingNumbers.delete(number);
    }

    this.search.toggleSelected(selected.filter((item) => !isMissing(item)));
    this.selectedMissingNumbers = [...missingNumbers];
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
   * Shows the active season's episodes in the chosen order, or in the given one, which then becomes
   * the chosen order once they show in it. A reload keeps the page, unless given another, and the
   * selected episodes that are still in the season.
   */
  @modelFlow
  loadEpisodes = asyncAction(
    async ({
      isReload = false,
      page,
      sortValue,
    }: { isReload?: boolean; page?: number; sortValue?: SortMenuProps["value"] } = {}) => {
      const revision = this.loadRevision;
      const episodesRevision = ++this.episodesRevision;
      const fileIds = [...(this.activeSeason?.fileIds ?? [])];
      const fileIdSet = new Set(fileIds);
      const { isDesc, key } = sortValue ?? this.episodeSort;

      let ids = isDesc ? [...fileIds].reverse() : fileIds;

      // Sorted by a file's details, episodes keep their numbers but show in that order.
      if (key !== "custom" && fileIds.length) {
        const res = await rpc.listSortedFileIds({ ids: fileIds, sortValue: { isDesc, key } });
        if (revision !== this.loadRevision || episodesRevision !== this.episodesRevision) return;
        if (!res.success) throw new Error(res.error);

        ids = res.data;
      }

      if (sortValue) this.setEpisodeSort({ isDesc, key });

      this.search.setForcePages(true);
      this.search.setIds(ids);
      this.search.setSelectedIds(
        isReload ? this.search.selectedIds.filter((id) => fileIdSet.has(id)) : [],
      );

      if (!isReload) this.setSelectedMissingNumbers([]);

      if (!fileIds.length) {
        // Selections over the query would otherwise still list the previous season's files.
        this.search.cancelSelection();
        this.search.setCachedFilterProps(null);

        this.search.setResults([]);
        this.search.setPage(1);
        this.search.setPageCount(1);
      } else {
        const res = await this.search.loadFiltered({
          noCache: true,
          page: page ?? (isReload ? this.search.page : 1),
          withFullCount: true,
        });

        if (revision === this.loadRevision && !res.success) throw new Error(res.error);
      }
    },
  );

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
    const res = await this.saveMissingMarks(
      Object.fromEntries(
        this.selectedMissingNumbers.map((number) => [
          getMissingEpisodeKey(this.activeSourceSeasonNumber, number),
          mark,
        ]),
      ),
    );
    if (!res.success) throw new Error(res.error);
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
    const fileNames = await listFileNames([...this.search.selectedIds]);

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

  /** Saves the program's marks on episodes without files, with each change's mark or none. */
  @modelFlow
  saveMissingMarks = asyncAction(
    async (changes: Record<string, MediaProgramMissingMark | null>) => {
      const marks = { ...derefMobx(this.program.missingMarks ?? {}) };

      for (const [key, mark] of Object.entries(changes)) {
        if (mark) marks[key] = mark;
        else delete marks[key];
      }

      const res = await rpc.updateMediaProgram({
        id: this.program.id,
        updates: { missingMarks: marks },
      });
      if (!res.success) throw new Error(res.error);

      this.updateProgram(res.data);
    },
  );

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

  /**
   * Selects every episode of the shown season, with or without a file. Resolves to how many, or
   * null when a later selection replaced it.
   */
  @modelFlow
  selectAllEpisodes = asyncAction(async () => {
    const res = await this.search.selectAllInQuery();
    if (!res.success) throw new Error(res.error);
    if (res.data === null) return null;

    this.setSelectedMissingNumbers(this.missingEpisodes.map((episode) => episode.number));

    return res.data + this.missingEpisodes.length;
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
   * Marks every episode in the seasons watched or unwatched at once, including those their
   * metadata lists without files, which keep any skipped marks.
   */
  @modelFlow
  setSeasonsWatched = asyncAction(
    async ({ ids, isWatched }: { ids: string[]; isWatched: boolean }) => {
      const metaNumbers = getMediaProgramMetaSeasonNumbers(this.seasons);
      const seasons = this.seasons
        .map((season, index) => ({ number: metaNumbers[index], season }))
        .filter(({ season }) => ids.includes(season.id));

      const fileIds = [...new Set(seasons.flatMap(({ season }) => season.fileIds.map(String)))];
      // Skipped marks stay, and marks already as asked aren't sent.
      const missingKeys = seasons
        .flatMap(({ number, season }) =>
          getSeasonMissingEpisodes(season).map((episode) =>
            getMissingEpisodeKey(number, episode.number),
          ),
        )
        .filter((key) => {
          const mark = this.program.missingMarks?.[key];
          return isWatched ? !mark : mark === "watched";
        });

      if (fileIds.length) {
        const res = await this.setEpisodesWatched({ fileIds, isWatched });
        if (!res.success) throw new Error(res.error);
      }

      if (missingKeys.length) {
        const res = await this.saveMissingMarks(
          Object.fromEntries(missingKeys.map((key) => [key, isWatched ? "watched" : null])),
        );
        if (!res.success) throw new Error(res.error);
      }
    },
  );

  /** Shows the episodes in another order from the first page, keeping their numbers and selection. */
  @modelFlow
  sortEpisodes = asyncAction(async (sortValue: SortMenuProps["value"]) => {
    const res = await this.loadEpisodes({ isReload: true, page: 1, sortValue });
    if (!res.success) throw new Error(res.error);
  });

  /**
   * Moves the chosen seasons' episodes into the seasons their file names give, at the numbers they
   * give. Resolves to how many episodes' names gave a season, and how many of those moved.
   */
  @modelFlow
  splitSeasons = asyncAction(async () => {
    const sourceIds = this.selectedSeasonIdSet;
    const fileNames = await listFileNames(
      this.seasons
        .filter((season) => sourceIds.has(season.id))
        .flatMap((season) => season.fileIds.map(String)),
    );

    const { movedCount, namedCount, seasons } = splitSeasonsByFileNames(
      this.seasons.map(toSeasonInput),
      sourceIds,
      fileNames,
    );

    if (movedCount) {
      const res = await this.saveSeasons(seasons);
      if (!res.success) throw new Error(res.error);
    }

    return { movedCount, namedCount };
  });

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
    } else if (this.activeSeason && !this.isActiveSeasonShown) {
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

  /** Numbers of the active season that several files share, such as two files named as one. */
  @computed
  get conflictNumbers() {
    const numbers = [...this.activeEpisodeNumbers.values()];
    return new Set(numbers.filter((number, index) => number === numbers[index - 1]));
  }

  @computed
  get episodeIds() {
    return this.program?.episodeIds ?? [];
  }

  /**
   * Selection over the shown season's episodes with and without files, for the selection buttons
   * and hotkeys.
   */
  @computed
  get episodeSelection() {
    return {
      results: this.pageEpisodes.map((item) => ({
        id: "file" in item ? item.file.id : toMissingId(item.number),
      })),
      selectAllInQuery: this.selectAllEpisodes,
      selectedIds: [...this.search.selectedIds, ...this.selectedMissingNumbers.map(toMissingId)],
      toggleSelected: this.toggleEpisodesSelected,
    };
  }

  /** Whether the shown episodes are the active season's, in number order when sorted by it. */
  @computed
  get isActiveSeasonShown() {
    const fileIds = [...(this.activeSeason?.fileIds ?? [])];
    const shownIds = [...this.search.ids];

    if (this.episodeSort.key !== "custom") return isDeepEqual(fileIds.sort(), shownIds.sort());
    else return isDeepEqual(this.episodeSort.isDesc ? fileIds.reverse() : fileIds, shownIds);
  }

  /**
   * The shown season's episodes the metadata source lists without files: those at numbers no file
   * of the active season has, or every episode of a missing season.
   */
  @computed
  get missingEpisodes() {
    if (this.activeSeason) return getSeasonMissingEpisodes(this.activeSeason);
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
   * The page's episodes. In number order, the missing ones are among them: those after the previous
   * page's last episode, up to this page's last or, on the last page, every one after it. In another
   * order, the missing ones follow the last page's episodes.
   */
  @computed
  get pageEpisodes() {
    const ids = this.search.ids;
    const results = this.search.results;
    const pageOffset = (this.search.page - 1) * this.search.pageSize;
    const isLastPage = this.search.page >= this.search.pageCount;

    const files = results.map((file) => ({ file, number: this.activeEpisodeNumbers.get(file.id) }));
    const missing = this.missingEpisodes.map((episode) => ({ episode, number: episode.number }));

    if (this.episodeSort.key !== "custom") return isLastPage ? [...files, ...missing] : files;
    else {
      // Positions run against the numbers when sorted by them descending.
      const sign = this.episodeSort.isDesc ? -1 : 1;
      const getPosition = (fileId: string) => sign * this.activeEpisodeNumbers.get(fileId);
      const lower = pageOffset > 0 ? getPosition(ids[pageOffset - 1]) : -Infinity;
      const upper = isLastPage ? Infinity : getPosition(ids[pageOffset + results.length - 1]);

      return [
        ...files,
        ...missing.filter(({ number }) => sign * number > lower && sign * number <= upper),
      ].sort((a, b) => sign * (a.number - b.number));
    }
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
  /** The shown season's episode's label, as EP ## or S##E##. */
  getEpisodeLabel(episodeNumber: number) {
    return makeEpisodeLabel(episodeNumber, this.activeSourceSeasonNumber, this.episodeLabels);
  }

  /** The source's details for the active season's episode at the file's number. */
  getEpisodeMeta(fileId: string) {
    const number = this.activeEpisodeNumbers.get(fileId);

    return number
      ? this.activeSeason.meta?.episodes.find((episode) => episode.number === number)
      : null;
  }

  /** Whether the source lists the active season's episodes, but none at the file's number. */
  getIsUnmatched(fileId: string) {
    return this.activeSeason?.meta?.episodes?.length > 0 && !this.getEpisodeMeta(fileId);
  }

  /** The mark on the shown season's episode without a file, if it has one. */
  getMissingMark(episodeNumber: number) {
    const key = getMissingEpisodeKey(this.activeSourceSeasonNumber, episodeNumber);
    return this.program?.missingMarks?.[key] ?? null;
  }

  /**
   * A season's watched episodes over all of them, including those its metadata lists without
   * files, which count as watched when marked watched elsewhere and toward neither when skipped.
   */
  getEpisodeCounts(season: MediaProgramSeason) {
    const index = this.seasons.findIndex(({ id }) => id === season.id);
    const missing = countMissingEpisodes(
      [
        {
          episodes: getSeasonMissingEpisodes(season),
          number: getMediaProgramMetaSeasonNumbers(this.seasons)[index],
        },
      ],
      this.program?.missingMarks,
    );

    return {
      total: season.fileIds.length + missing.total,
      watched:
        season.fileIds.filter((fileId) => this.program?.watchedIdSet.has(fileId)).length +
        missing.watched,
    };
  }
}
