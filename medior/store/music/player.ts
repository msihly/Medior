import { ipcRenderer } from "electron";
import autoBind from "auto-bind";
import Color from "color";
import { computed } from "mobx";
import { Model, model, modelAction, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { pathToFileURL } from "url";
import { File } from "medior/store";
import { asyncAction, CssColor, loadFilesWithTags, toast } from "medior/utils/client";
import { getMusicTrackTitle } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { getCoverColors, readCoverArt } from "medior/utils/server/cover-art";

/** Whether the queue starts over after its last track, or the track playing repeats. */
export type MusicLoopMode = "all" | "off" | "one";

/** Where playback picks up, such as when a queue moves into the compact player window. */
export interface MusicPlayback {
  fileIds: string[];
  index: number;
  isPlaying: boolean;
  /** Left out to keep the player's own shuffle. */
  isShuffled?: boolean;
  /** Left out to keep the player's own loop mode. */
  loopMode?: MusicLoopMode;
  /** Seconds into the track. */
  time: number;
  /** Left out to keep the player's own volume. */
  volume?: number;
}

/** The loop modes the loop button steps through, in order. */
const LOOP_MODES: MusicLoopMode[] = ["off", "all", "one"];

/** Earlier than this many seconds into a track, Previous goes to the track before it. */
const RESTART_SECONDS = 3;

/** The volume before muting, which unmuting restores, as the carousel's does. */
const LAST_VOLUME_KEY = "medior.music.lastVolume";
/** The last volume set, which players in every window start at, as the carousel's does. */
const VOLUME_KEY = "medior.music.volume";

/** The color with its lightness kept within the given percentages, keeping its hue. */
const withLightness = (hex: string, minLightness: number, maxLightness: number) => {
  const color = Color(hex);
  const lightness = Math.min(Math.max(color.lightness(), minLightness), maxLightness);

  return color.lightness(lightness).hex() as CssColor;
};

/**
 * Plays a queue of tracks through the window's audio element, which the player attaches. The
 * element reports back as it plays, so its state here follows what's heard.
 */
@model("medior/MusicPlayerStore")
export class MusicPlayerStore extends Model({
  /** The track's cover art's most vivid color, while Settings colors the player with its cover. */
  coverAccent: prop<string>(null).withSetter(),
  /** The track's cover art's dominant colors, most common first, while Settings uses them. */
  coverColors: prop<string[]>(() => []).withSetter(),
  /** The track's own cover art as a data URL, which the compact player shows over its thumbnail. */
  coverUrl: prop<string>(null).withSetter(),
  /** Seconds into the track. */
  currentTime: prop<number>(0).withSetter(),
  duration: prop<number>(0).withSetter(),
  /** The track playing, loaded for its title, artist, and cover. */
  file: prop<File>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  index: prop<number>(0).withSetter(),
  isPlaying: prop<boolean>(false).withSetter(),
  /** The rest of the queue plays in a random order, which the queue list keeps its own order for. */
  isShuffled: prop<boolean>(false).withSetter(),
  /** A track is loading to play, such as the next one after the last ended, which isn't playing yet. */
  isStarting: prop<boolean>(false).withSetter(),
  /** The volume before muting, which unmuting restores. */
  lastVolume: prop<number>(1),
  loopMode: prop<MusicLoopMode>("off"),
  /**
   * Queued tracks' "Artist - Title" labels by file ID, loaded as the queue list shows them. Tracks
   * no longer in the library have null.
   */
  queueLabels: prop<Record<string, string>>(() => ({})).withTransform(
    objectToMapTransform<string>(),
  ),
  /** The queue's indexes in the order they play while shuffled, from the track shuffled from. */
  shuffleOrder: prop<number[]>(() => []),
  volume: prop<number>(1),
}) {
  private audio: HTMLAudioElement = null;
  /** Stops reading an earlier track's cover art once another track's is wanted. */
  private coverAbortController: AbortController = null;
  /** Queued tracks whose labels are loading, which aren't requested again meanwhile. */
  private labelLoadIds = new Set<string>();
  /** The URL of the track loaded, which only its own errors come from. */
  private loadedUrl: string = null;
  /** Each track load, so a slower one for an earlier track never replaces a later one. */
  private loadRevision = 0;
  /** Seconds the loading track starts at, applied once the element knows its length. */
  private startTime = 0;

  onInit() {
    autoBind(this);

    const lastVolume = localStorage.getItem(LAST_VOLUME_KEY);
    const volume = localStorage.getItem(VOLUME_KEY);

    if (lastVolume !== null && Number.isFinite(Number(lastVolume)))
      this.lastVolume = Number(lastVolume);

    if (volume !== null && Number.isFinite(Number(volume))) this.volume = Number(volume);
  }

  /** Plays the element, which refuses quietly when a newer track replaced this one meanwhile. */
  private async playAudio() {
    const revision = this.loadRevision;

    try {
      await this.audio.play();
    } catch (error) {
      if (revision === this.loadRevision && error.name !== "AbortError") toast.error(error.message);
    } finally {
      if (revision === this.loadRevision) this.setIsStarting(false);
    }
  }

  /**
   * The queue index that plays a step after or before the track playing, in shuffled order while
   * shuffling. Past either end it wraps around while the whole queue loops, and is null otherwise.
   */
  private getAdjacentIndex(step: 1 | -1) {
    const count = this.fileIds.length;
    const order = this.isShuffled ? this.shuffleOrder : null;
    const position = (order ? order.indexOf(this.index) : this.index) + step;
    const isPastEnd = position < 0 || position >= count;
    if (!count || (isPastEnd && this.loopMode !== "all")) return null;

    const wrapped = (position + count) % count;
    return order ? order[wrapped] : wrapped;
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addQueueLabels(labels: [fileId: string, label: string][]) {
    for (const [fileId, label] of labels) this.queueLabels.set(fileId, label);
  }

  /** The element tracks play through. */
  attachAudio(audio: HTMLAudioElement) {
    this.audio = audio;
    audio.loop = this.loopMode === "one";
    audio.volume = this.volume;
  }

  @modelAction
  changeVolume(volume: number) {
    this.volume = volume;
    localStorage.setItem(VOLUME_KEY, String(volume));

    if (this.audio) this.audio.volume = volume;
  }

  /** Steps the loop mode from off to the whole queue to the track playing, then off again. */
  cycleLoopMode() {
    this.setLoopMode(LOOP_MODES[(LOOP_MODES.indexOf(this.loopMode) + 1) % LOOP_MODES.length]);
  }

  /** Lets go of an element that's gone, unless another has replaced it. */
  detachAudio(audio: HTMLAudioElement) {
    if (this.audio === audio) this.audio = null;
  }

  /** Moves the queue and its position back into the main window, which plays it from here. */
  dock() {
    ipcRenderer.send("dockMusicPlayer", this.getPlayback());
    this.stop();
  }

  /** Where playback is, counting a track that's loading to play as playing. */
  getPlayback(): MusicPlayback {
    return {
      fileIds: [...this.fileIds],
      index: this.index,
      isPlaying: this.isActive,
      isShuffled: this.isShuffled,
      loopMode: this.loopMode,
      time: this.currentTime,
      volume: this.volume,
    };
  }

  /** Moves the queue and its position into the compact player window, which plays it from here. */
  popOut() {
    ipcRenderer.send("createMusicPlayerWindow", this.getPlayback());
    this.stop();
  }

  /** Seeks the track, replacing where a loading one was meant to start. */
  @modelAction
  seek(time: number) {
    this.currentTime = time;
    this.startTime = 0;

    if (this.audio) this.audio.currentTime = time;
  }

  /** Repeating the track playing loops the element itself, so the track never ends. */
  @modelAction
  setLoopMode(loopMode: MusicLoopMode) {
    this.loopMode = loopMode;

    if (this.audio) this.audio.loop = loopMode === "one";
  }

  /** Shuffles the queue's other tracks to play after the one at the index, while shuffling is on. */
  @modelAction
  shuffleFrom(index: number) {
    if (!this.isShuffled) this.shuffleOrder = [];
    else {
      const rest = this.fileIds.map((_, i) => i).filter((i) => i !== index);

      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }

      this.shuffleOrder = [index, ...rest];
    }
  }

  /** Stops playing and empties the queue. */
  @modelAction
  stop() {
    this.coverAbortController?.abort();
    this.loadedUrl = null;
    this.loadRevision++;

    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }

    this.coverAccent = null;
    this.coverColors = [];
    this.coverUrl = null;
    this.currentTime = 0;
    this.duration = 0;
    this.file = null;
    this.fileIds = [];
    this.index = 0;
    this.isPlaying = false;
    this.isStarting = false;
    this.queueLabels.clear();
    this.shuffleOrder = [];
  }

  /** Mutes, keeping the volume to restore, or unmutes to the volume before muting. */
  @modelAction
  toggleMute() {
    if (this.volume === 0) this.changeVolume(this.lastVolume);
    else {
      this.lastVolume = this.volume;
      this.changeVolume(0);
    }

    localStorage.setItem(LAST_VOLUME_KEY, String(this.lastVolume));
  }

  togglePlay() {
    if (!this.audio || !this.file) return;
    else if (this.audio.paused) this.playAudio();
    else this.audio.pause();
  }

  /** Shuffling starts from the track playing, and stopping it goes on in the queue's order. */
  @modelAction
  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    this.shuffleFrom(this.index);
  }

  /** Starts the loaded track where it was meant to, once the element can seek in it. */
  handleLoadedMetadata() {
    if (this.audio && this.startTime > 0) this.audio.currentTime = this.startTime;

    this.startTime = 0;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  async handleEnded() {
    const res = await this.next();
    if (!res.success) toast.error(res.error);
  }

  /**
   * A track that can't play, such as one in a format Chromium doesn't decode, is skipped. Errors from
   * a track already replaced, or from emptying the element, are ignored.
   */
  async handleError() {
    if (!this.file || !this.audio?.error || this.audio.currentSrc !== this.loadedUrl) return;

    toast.error(`Couldn't play ${getMusicTrackTitle(this.file)}`);

    const res = await this.next();
    if (!res.success) toast.error(res.error);
  }

  /**
   * Reads the playing track's own cover art, keeping the image for the compact player and its
   * dominant colors when asked. Tracks without cover art keep their thumbnail and the player's own
   * colors.
   */
  @modelFlow
  loadCover = asyncAction(
    async ({ withColors, withImage }: { withColors: boolean; withImage: boolean }) => {
      this.coverAbortController?.abort();
      this.coverAbortController = new AbortController();

      const signal = this.coverAbortController.signal;
      const file = this.file;

      this.setCoverAccent(null);
      this.setCoverColors([]);
      this.setCoverUrl(null);

      if (!file?.music?.hasCover || (!withColors && !withImage)) return;

      try {
        const cover = await readCoverArt(file.path, signal);
        const colors = withColors ? await getCoverColors(cover, 3) : null;
        if (signal.aborted) return;

        this.setCoverAccent(colors?.accent ?? null);
        this.setCoverColors(colors?.dominant ?? []);

        if (withImage) this.setCoverUrl(`data:image/png;base64,${cover.toString("base64")}`);
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    },
  );

  /** Shows and plays the queue's track at the index, starting the given seconds in. */
  @modelFlow
  loadTrack = asyncAction(
    async ({ isPlaying = true, time = 0 }: { isPlaying?: boolean; time?: number } = {}) => {
      const revision = ++this.loadRevision;
      const fileId = this.fileIds[this.index];

      this.setIsStarting(isPlaying);

      if (!fileId) this.stop();
      else {
        const [file] = await loadFilesWithTags([fileId]);
        if (revision !== this.loadRevision) return;

        if (!file) {
          this.setIsStarting(false);
          throw new Error("This track is no longer in the library.");
        }

        this.setFile(new File(file));
        this.setCurrentTime(time);
        this.setDuration(file.duration ?? 0);

        // A file URL keeps characters such as # in a track's name from reading as part of a URL.
        // The element's own reading of it is kept, as its errors name the URL that way.
        if (!this.audio) this.setIsStarting(false);
        else {
          this.audio.src = pathToFileURL(file.path).href;
          this.loadedUrl = this.audio.src;
          this.startTime = time;

          if (isPlaying) this.playAudio();
        }
      }
    },
  );

  /** Loads the labels of the queued tracks given, leaving out those loaded or loading already. */
  @modelFlow
  loadQueueLabels = asyncAction(async (fileIds: string[]) => {
    const ids = fileIds.filter((id) => !this.queueLabels.has(id) && !this.labelLoadIds.has(id));
    if (!ids.length) return;

    for (const id of ids) this.labelLoadIds.add(id);

    try {
      const res = await rpc.listFile({
        args: { filter: { id: ids }, page: 1, pageSize: ids.length },
      });
      if (!res.success) throw new Error(res.error);

      const files = new Map(res.data.items.map((file) => [file.id, file]));

      this.addQueueLabels(
        ids.map((id) => {
          const file = files.get(id);
          const title = file ? getMusicTrackTitle(file) : null;

          return [id, file?.music?.artist ? `${file.music.artist} - ${title}` : title];
        }),
      );
    } finally {
      for (const id of ids) this.labelLoadIds.delete(id);
    }
  });

  /** Plays the next track, or stops after the last unless the whole queue loops. */
  @modelFlow
  next = asyncAction(async () => {
    const index = this.getAdjacentIndex(1);

    if (index === null) this.stop();
    else {
      this.setIndex(index);

      const res = await this.loadTrack();
      if (!res.success) throw new Error(res.error);
    }
  });

  /** Plays the queue's track at the index, such as one double-clicked in the queue list. */
  @modelFlow
  playIndex = asyncAction(async (index: number) => {
    this.setIndex(index);

    const res = await this.loadTrack();
    if (!res.success) throw new Error(res.error);
  });

  /** Plays the queue from the track, or from its first when the track isn't in it. */
  @modelFlow
  playQueue = asyncAction(async ({ fileId, fileIds }: { fileId?: string; fileIds: string[] }) => {
    if (!fileIds.length) throw new Error("There are no tracks to play.");

    const index = Math.max(0, fileIds.indexOf(fileId));

    this.setFileIds([...fileIds]);
    this.setIndex(index);
    this.shuffleFrom(index);

    const res = await this.loadTrack();
    if (!res.success) throw new Error(res.error);
  });

  /** Restarts the track once it's a few seconds in, or else plays the track before it. */
  @modelFlow
  previous = asyncAction(async () => {
    const index = this.getAdjacentIndex(-1);

    if (this.currentTime > RESTART_SECONDS || index === null) this.seek(0);
    else {
      this.setIndex(index);

      const res = await this.loadTrack();
      if (!res.success) throw new Error(res.error);
    }
  });

  /**
   * Rates the track playing. The player shows the new rating itself, as the compact player window
   * doesn't follow the library's updates.
   */
  @modelFlow
  rate = asyncAction(async (rating: number) => {
    const file = this.file;
    if (!file) return;

    const res = await rpc.setFileRating({ fileIds: [file.id], rating });
    if (!res.success) throw new Error(res.error);

    file.update({ rating });
  });

  /** Picks up playback moved here, such as into the compact player window. */
  @modelFlow
  resume = asyncAction(async (playback: MusicPlayback) => {
    this.setFileIds([...playback.fileIds]);
    this.setIndex(playback.index);

    if (playback.isShuffled !== undefined) this.setIsShuffled(playback.isShuffled);
    if (playback.loopMode !== undefined) this.setLoopMode(playback.loopMode);
    if (playback.volume !== undefined) this.changeVolume(playback.volume);

    this.shuffleFrom(playback.index);

    const res = await this.loadTrack({ isPlaying: playback.isPlaying, time: playback.time });
    if (!res.success) throw new Error(res.error);
  });

  /* --------------------------------- GETTERS -------------------------------- */
  /**
   * The player's colors from its cover art: surfaces in its dominant colors, darkened to keep white
   * text readable on them, and controls in its accent, lightened to show on those surfaces. Null
   * without cover colors; a cover without a vivid color leaves its controls' usual colors.
   */
  @computed
  get coverTheme() {
    if (!this.coverColors.length) return null;

    const [main, second = main] = this.coverColors;

    return {
      accent: this.coverAccent ? withLightness(this.coverAccent, 50, 70) : undefined,
      /** Large surfaces, such as the music view behind its cards and around its controls. */
      background: withLightness(main, 0, 12),
      bar: withLightness(main, 0, 24),
      header: withLightness(main, 0, 18),
      queue: withLightness(second, 0, 14),
    };
  }

  /** A track plays after this one, in the order the queue plays in. */
  @computed
  get hasNext() {
    return this.getAdjacentIndex(1) !== null;
  }

  /** Playing, or loading a track to play, such as the next one after the last ended. */
  @computed
  get isActive() {
    return this.isPlaying || this.isStarting;
  }
}
