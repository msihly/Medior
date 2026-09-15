import autoBind from "auto-bind";
import { applySnapshot, getSnapshot, Model, model, modelAction, prop } from "mobx-keystone";
import { CssColor } from "medior/utils/client";
import { dayjs } from "medior/utils/common";
import { RepairAudioStore } from "./audio";
import { RepairCollectionsStore } from "./collections";
import { RepairFilesStore } from "./files";
import { RepairIndexesStore } from "./indexes";
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
  isOpen: prop<boolean>(false),
  isRunning: prop<boolean>(false).withSetter(),
  outputLog: prop<RepairLog[]>(() => []).withSetter(),
  repairId: prop<string | null>(null).withSetter(),
  similarity: prop<boolean>(false).withSetter(),
  similarityJobId: prop<string | null>(null).withSetter(),
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

    this.isOpen = isOpen;
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get canStart() {
    return (
      !this.isRunning &&
      !(this.audio.enabled && this.audio.transcriptions && !this.audio.maxDuration) &&
      (this.audio.isSelected ||
        this.collections.isSelected ||
        this.files.isSelected ||
        this.indexes.isSelected ||
        this.similarity ||
        this.tags.isSelected ||
        this.thumbnails.isSelected)
    );
  }
}
