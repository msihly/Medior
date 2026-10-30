import autoBind from "auto-bind";
import {
  applySnapshot,
  getSnapshot,
  Model,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, colors, CssColor } from "medior/utils/client";
import { dayjs } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { RepairAudioStore } from "./audio";
import { RepairCollectionsStore } from "./collections";
import { RepairFilesStore } from "./files";
import { RepairIndexesStore } from "./indexes";
import { RepairSimilarityStore } from "./similarity";
import { RepairTagsStore } from "./tags";
import { RepairThumbnailsStore } from "./thumbnails";

const MAX_OUTPUT_LOG_LENGTH = 500;

export interface RepairLog {
  color?: CssColor;
  isReplaceable?: boolean;
  text: string;
}

@model("medior/RepairStore")
export class RepairStore extends Model({
  audio: prop<RepairAudioStore>(() => new RepairAudioStore({})),
  collections: prop<RepairCollectionsStore>(() => new RepairCollectionsStore({})),
  files: prop<RepairFilesStore>(() => new RepairFilesStore({})),
  indexes: prop<RepairIndexesStore>(() => new RepairIndexesStore({})),
  isCancellationRequested: prop<boolean>(false).withSetter(),
  isConfirmCancelOpen: prop<boolean>(false).withSetter(),
  /** The modal is hidden while its repair runs in the background. */
  isMinimized: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false),
  isRunning: prop<boolean>(false).withSetter(),
  outputLog: prop<RepairLog[]>(() => []).withSetter(),
  repairId: prop<string | null>(null).withSetter(),
  similarity: prop<RepairSimilarityStore>(() => new RepairSimilarityStore({})),
  storage: prop<boolean>(false).withSetter(),
  tags: prop<RepairTagsStore>(() => new RepairTagsStore({})),
  thumbnails: prop<RepairThumbnailsStore>(() => new RepairThumbnailsStore({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  log(message: string, color?: CssColor, isReplaceable = false) {
    const entry = { color, isReplaceable, text: `[${dayjs().format("HH:mm:ss.SSS")}] ${message}` };

    this.outputLog = (
      isReplaceable && this.outputLog[this.outputLog.length - 1]?.isReplaceable
        ? [...this.outputLog.slice(0, -1), entry]
        : [...this.outputLog, entry]
    ).slice(-MAX_OUTPUT_LOG_LENGTH);
  }

  @modelAction
  setIsOpen(isOpen: boolean) {
    if (!isOpen) applySnapshot<RepairStore>(this, getSnapshot(new RepairStore({})));

    this.isMinimized = false;
    this.isOpen = isOpen;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  cancel = asyncAction(async () => {
    const repairId = this.repairId;

    this.setIsCancellationRequested(true);
    this.log("[INFO] Cancelling the current operation.");

    if (repairId) {
      const res = await rpc.cancelRepair({ repairId });

      if (!res.success) {
        this.log(`[ERROR] Failed to request repair cancellation: ${res.error}`, colors.custom.red);

        return false;
      }
    }

    return true;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get canStart() {
    return (
      !this.isRunning &&
      !(this.audio.enabled && this.audio.transcriptions && !this.audio.maxDuration) &&
      !(this.audio.enabled && this.audio.similarity && !this.audio.similarityMaxDuration) &&
      (this.audio.isSelected ||
        this.collections.isSelected ||
        this.files.isSelected ||
        this.indexes.isSelected ||
        this.similarity.enabled ||
        this.storage ||
        this.tags.isSelected ||
        this.thumbnails.isSelected)
    );
  }
}
