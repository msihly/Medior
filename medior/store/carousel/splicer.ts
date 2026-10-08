import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { FileSchema } from "medior/server/database";
import { RootStore } from "medior/store";
import { asyncAction, derefMobx, toast } from "medior/utils/client";
import {
  isDeepEqual,
  normalizeTimestampPairs,
  parseTimestampPairs,
  secondsToDuration,
  uuid,
} from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type FileTimestamp = FileSchema["timestamps"][number];

export type FileTimestampPair = FileTimestamp["pairs"][number];

@model("medior/Splicer")
export class Splicer extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  timestampId: prop<string>(""),
  timestampLabel: prop<string>("").withSetter(),
  timestampPairs: prop<FileTimestampPair[]>(() => []).withSetter(),
}) {
  onAttachedToRootStore(stores: RootStore) {
    return reaction(
      () => [this.isOpen, stores.carousel.activeFileId],
      () => {
        if (this.isOpen) this.loadTimestamps();
      },
      { fireImmediately: true },
    );
  }

  onInit() {
    autoBind(this);
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
  loadTimestamps() {
    const stores = getRootStore<RootStore>(this);

    const file = stores.carousel.getActiveFile();

    this.setTimestampId(file?.timestamps?.[0]?.id ?? "");
  }

  @modelAction
  removeTimestampPair(id: string) {
    this.timestampPairs = this.timestampPairs
      .filter((p) => p.id !== id)
      .map((p, i) => ({ ...p, order: i + 1 }));
  }

  @modelAction
  setTimestampId(id: string) {
    const stores = getRootStore<RootStore>(this);

    const timestamp = stores.carousel.getActiveFile()?.timestamps?.find((item) => item.id === id);

    if (id && !timestamp) throw new Error("Timeline not found");

    this.timestampId = timestamp?.id ?? "";
    this.timestampLabel = timestamp?.label ?? "Timeline #1";
    this.timestampPairs = normalizeTimestampPairs(derefMobx(timestamp?.pairs ?? []));
  }

  @modelAction
  setTimestampPairOrder(id: string, order: number) {
    const current = this.timestampPairs.find((pair) => pair.id === id);
    const other = this.timestampPairs.find((pair) => pair.order === order);

    if (!current || !other) throw new Error("Timestamp pair not found");

    this.timestampPairs = this.timestampPairs
      .map((p) =>
        p.id === id ? { ...p, order } : p.id === other.id ? { ...p, order: current.order } : p,
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

    try {
      const timestamps = file.timestamps.filter((timestamp) => timestamp.id !== this.timestampId);
      const res = await trpc.updateFile.mutate({
        args: {
          id: file.id,
          updates: { timestamps },
        },
      });

      if (!res.success) throw new Error(res.error);

      file.update({ timestamps });

      if (stores.carousel.activeFileId === file.id) this.loadTimestamps();
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  saveTimestamps = asyncAction(async () => {
    if (!this.timestampLabel.trim()) throw new Error("Label is required");

    const stores = getRootStore<RootStore>(this);

    const file = stores.carousel.getActiveFile();

    if (!file) throw new Error("Active file not found");

    parseTimestampPairs(this.timestampPairs, file.duration);

    const id = this.timestampId || uuid();
    const newTimestamp = {
      id,
      label: this.timestampLabel.trim(),
      pairs: normalizeTimestampPairs<FileTimestampPair>(derefMobx(this.timestampPairs)),
    };
    const timestamps = this.timestampId
      ? file.timestamps.map((timestamp) =>
          timestamp.id === this.timestampId ? newTimestamp : timestamp,
        )
      : [...(file.timestamps ?? []), newTimestamp];

    this.setIsLoading(true);

    try {
      const res = await trpc.updateFile.mutate({
        args: {
          id: file.id,
          updates: { timestamps },
        },
      });

      if (!res.success) throw new Error(res.error);

      file.update({ timestamps });

      if (stores.carousel.activeFileId === file.id) this.setTimestampId(id);

      toast.success("Saved");
    } finally {
      this.setIsLoading(false);
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get hasChanges() {
    const stores = getRootStore<RootStore>(this);

    const timestamp = stores.carousel
      .getActiveFile()
      ?.timestamps?.find((item) => item.id === this.timestampId);

    return (
      !timestamp ||
      timestamp.label !== this.timestampLabel ||
      !isDeepEqual(normalizeTimestampPairs(timestamp.pairs), this.timestampPairs)
    );
  }

  @computed
  get orderOptions() {
    return [...this.timestampPairs]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ label: String(p.order), value: String(p.order) }));
  }
}
