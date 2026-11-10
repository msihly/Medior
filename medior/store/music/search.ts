import { reaction } from "mobx";
import {
  ExtendedModel,
  model,
  modelAction,
  modelFlow,
  objectToMapTransform,
  prop,
} from "mobx-keystone";
import {
  _MusicAlbumSearch,
  _MusicArtistSearch,
  _MusicPlaylistSearch,
} from "medior/store/_generated";
import { File, FileSearch } from "medior/store";
import { asyncAction, derefMobx, loadFilesWithTags } from "medior/utils/client";
import { getConfig, rpc } from "medior/utils/server";

interface CoverSearch {
  files: Map<string, File>;
  loadId: number;
  results: { coverFileId?: string }[];
  setFiles: (files: Map<string, File>) => void;
}

/** Loads each result's cover file, unless every cover is loaded already. */
const loadCoverFiles = async (search: CoverSearch) => {
  const loadId = search.loadId;
  const results = search.results;
  const fileIds = [...new Set(results.map((item) => item.coverFileId).filter(Boolean))];

  if (!fileIds.length) search.setFiles(new Map());
  else if (!fileIds.every((fileId) => search.files.has(fileId))) {
    const files = await loadFilesWithTags(fileIds);

    if (loadId === search.loadId && results === search.results)
      search.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
  }
};

const makeFilesProp = () =>
  prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter();

@model("medior/MusicAlbumSearch")
export class MusicAlbumSearch extends ExtendedModel(_MusicAlbumSearch, {
  files: makeFilesProp(),
}) {
  onInit() {
    super.onInit();

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  @modelFlow
  loadFiles = asyncAction(async () => loadCoverFiles(this));
}

@model("medior/MusicArtistSearch")
export class MusicArtistSearch extends ExtendedModel(_MusicArtistSearch, {
  files: makeFilesProp(),
}) {
  onInit() {
    super.onInit();

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  @modelFlow
  loadFiles = asyncAction(async () => loadCoverFiles(this));
}

@model("medior/MusicPlaylistSearch")
export class MusicPlaylistSearch extends ExtendedModel(_MusicPlaylistSearch, {
  files: makeFilesProp(),
}) {
  onInit() {
    super.onInit();

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  @modelFlow
  loadFiles = asyncAction(async () => loadCoverFiles(this));
}

/**
 * The library's tracks, which resetting the filters keeps to, sorted and paged as Settings sets
 * for them.
 */
@model("medior/MusicTrackSearch")
export class MusicTrackSearch extends ExtendedModel(FileSearch, {}) {
  /** A saved file search applied here still lists only tracks. */
  @modelAction
  afterApplySearchProps(searchProps: Record<string, any>) {
    super.afterApplySearchProps(searchProps);
    this.hasMusic = true;
  }

  @modelAction
  reset() {
    super.reset();
    this.hasMusic = true;
    this.pageSize = getConfig().music.tracks.search.pageSize;
    this.sortValue = getConfig().music.tracks.search.sort;
  }

  /** Every track the filters shown match, in their order, which a track played from them queues. */
  @modelFlow
  listTrackIds = asyncAction(async () => {
    const filterProps = derefMobx(this.cachedFilterProps ?? this.getFilterProps());

    const res = await rpc.listFileSearchIds({ ...filterProps, forcePages: this.forcePages });
    if (!res.success) throw new Error(res.error);

    return res.data;
  });
}
