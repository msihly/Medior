import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { FileSchema } from "medior/server/database";
import { RootStore } from "medior/store";
import { asyncAction, derefMobx, toast } from "medior/utils/client";
import { durationRegex, isDeepEqual, secondsToDuration, uuid } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type FileTimestamp = FileSchema["timestamps"][number];
export type FileTimestampPair = FileTimestamp["pairs"][number];

@model("medior/Splicer")
export class Splicer extends Model({
  hasChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  timestampId: prop<string>("").withSetter(),
  timestampLabel: prop<string>("").withSetter(),
  timestampPairs: prop<FileTimestampPair[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => this.isOpen && this.loadTimestamps(),
    );

    reaction(
      () => [this.timestampLabel, this.timestampPairs],
      () => {
        const stores = getRootStore<RootStore>(this);
        const file = stores.carousel.getActiveFile();
        if (!file) return;

        const timestamp = file.timestamps?.find((p) => p.id === this.timestampId);
        if (timestamp) {
          const hasLabelDiff = timestamp.label !== this.timestampLabel;
          const hasPairsDiff = !isDeepEqual(timestamp.pairs, this.timestampPairs);
          if (hasLabelDiff || hasPairsDiff) this.setHasChanges(true);
          else this.setHasChanges(false);
        } else this.setHasChanges(true);
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addTimestampPair() {
    const stores = getRootStore<RootStore>(this);
    this.timestampPairs.push({
      endDuration: "",
      id: uuid(),
      order: this.timestampPairs.length + 1,
      startDuration: secondsToDuration(stores.carousel.curTime),
    });
  }

  @modelAction
  removeTimestampPair(id: string) {
    this.timestampPairs = this.timestampPairs
      .filter((p) => p.id !== id)
      .map((p, i) => ({ ...p, order: i + 1 }));
  }

  @modelAction
  setTimestampPairOrder(id: string, order: number) {
    const oldOrder = this.timestampPairs.find((p) => p.id === id).order;
    const otherId = this.timestampPairs.find((p) => p.order === order).id;
    this.timestampPairs = this.timestampPairs
      .map((p) =>
        p.id === id ? { ...p, order } : p.id === otherId ? { ...p, order: oldOrder } : p,
      )
      .sort((a, b) => a.order - b.order);
  }

  @modelAction
  setTimestampPairVal(id: string, key: "endDuration" | "startDuration", val: string) {
    this.timestampPairs = this.timestampPairs.map((p) => (p.id === id ? { ...p, [key]: val } : p));
  }

  @modelAction
  toggleIsOpen() {
    this.isOpen = !this.isOpen;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  deleteTimeline = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    const file = stores.carousel.getActiveFile();
    if (!file) throw new Error("Active file not found");

    this.setIsLoading(true);
    const res = await trpc.updateFile.mutate({
      args: {
        id: file.id,
        updates: {
          timestamps: file.timestamps.filter((t) => t.id !== this.timestampId),
        },
      },
    });
    this.setIsLoading(false);
    if (!res.success) throw new Error(res.error);

    await stores.file.search.loadFiltered();
    await this.loadTimestamps();
  });

  @modelFlow
  loadTimestamps = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    const file = stores.carousel.getActiveFile();
    if (!file) throw new Error("Active file not found");

    const timestamp = derefMobx(file.timestamps?.[0]);
    if (timestamp) {
      this.timestampId = timestamp.id;
      this.timestampLabel = timestamp.label;
      this.timestampPairs = timestamp.pairs;
    } else {
      this.timestampId = null;
      this.timestampLabel = "Timeline #1";
      this.timestampPairs = [];
    }
  });

  @modelFlow
  saveTimestamps = asyncAction(async () => {
    if (!this.timestampLabel) throw new Error("Label is required");
    if (!this.timestampPairs.length) throw new Error("At least one pair is required");
    if (
      this.timestampPairs.some(
        (p) =>
          !p.startDuration ||
          !p.endDuration ||
          !durationRegex.test(p.startDuration) ||
          !durationRegex.test(p.endDuration),
      )
    )
      throw new Error("Fix invalid timestamps");

    const stores = getRootStore<RootStore>(this);
    const file = stores.carousel.getActiveFile();
    if (!file) throw new Error("Active file not found");

    const id = this.timestampId || uuid();
    const newTimestamp = { id, label: this.timestampLabel, pairs: this.timestampPairs };

    this.setIsLoading(true);
    const res = await trpc.updateFile.mutate({
      args: {
        id: stores.carousel.activeFileId,
        updates: {
          timestamps: !file.timestamps
            ? [newTimestamp]
            : this.timestampId
              ? file.timestamps.map((t) => (t.id === this.timestampId ? newTimestamp : t))
              : [...file.timestamps, newTimestamp],
        },
      },
    });
    this.setIsLoading(false);
    if (!res.success) throw new Error(res.error);

    this.setHasChanges(false);

    if (!res.success) toast.error(res.error);
    else toast.success("Saved");

    this.setTimestampId(id);
    await stores.file.search.loadFiltered();
    await this.loadTimestamps();
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get orderOptions() {
    return [...this.timestampPairs]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ label: String(p.order), value: String(p.order) }));
  }
}
