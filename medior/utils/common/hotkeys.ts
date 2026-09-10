export const RATING_HOTKEY_KEYS = [
  "rate1",
  "rate2",
  "rate3",
  "rate4",
  "rate5",
  "rate6",
  "rate7",
  "rate8",
  "rate9",
] as const;

export type RatingHotkeyKey = (typeof RATING_HOTKEY_KEYS)[number];

export type RatingHotkeys = Record<RatingHotkeyKey, string>;

export type FileHotkeys = RatingHotkeys & {
  deleteFiles: string;
  detectFaces: string;
  editTags: string;
  fileInfo: string;
  nextFile: string;
  previousFile: string;
  selectAll: string;
};

export interface Hotkeys {
  carousel: RatingHotkeys & {
    deleteFiles: string;
    detectFaces: string;
    editTags: string;
    fileInfo: string;
    nextFile: string;
    nextFrame: string;
    playPause: string;
    previousFile: string;
    previousFrame: string;
    seekBackward3Seconds: string;
    seekBackward30Seconds: string;
    seekForward3Seconds: string;
    seekForward30Seconds: string;
    volumeDown: string;
    volumeUp: string;
  };
  collectionEditor: Omit<FileHotkeys, "deleteFiles"> & {
    removeFiles: string;
  };
  home: FileHotkeys;
  search: FileHotkeys;
  tagManager: RatingHotkeys & {
    selectAll: string;
  };
}

const RATING_HOTKEY_DEFAULTS: RatingHotkeys = {
  rate1: "1",
  rate2: "2",
  rate3: "3",
  rate4: "4",
  rate5: "5",
  rate6: "6",
  rate7: "7",
  rate8: "8",
  rate9: "9",
};

const FILE_HOTKEY_DEFAULTS = {
  detectFaces: "F",
  editTags: "T",
  fileInfo: "I",
  nextFile: "ArrowRight",
  previousFile: "ArrowLeft",
  ...RATING_HOTKEY_DEFAULTS,
};

export const DEFAULT_HOTKEYS: Hotkeys = {
  carousel: {
    deleteFiles: "Delete",
    detectFaces: "F",
    editTags: "T",
    fileInfo: "I",
    nextFile: "ArrowRight",
    nextFrame: "Alt+ArrowRight",
    playPause: "Space",
    previousFile: "ArrowLeft",
    previousFrame: "Alt+ArrowLeft",
    ...RATING_HOTKEY_DEFAULTS,
    seekBackward3Seconds: "Shift+ArrowLeft",
    seekBackward30Seconds: "Ctrl+ArrowLeft",
    seekForward3Seconds: "Shift+ArrowRight",
    seekForward30Seconds: "Ctrl+ArrowRight",
    volumeDown: "ArrowDown",
    volumeUp: "ArrowUp",
  },
  collectionEditor: {
    ...FILE_HOTKEY_DEFAULTS,
    removeFiles: "Delete",
    selectAll: "Ctrl+A",
  },
  home: { deleteFiles: "Delete", ...FILE_HOTKEY_DEFAULTS, selectAll: "Ctrl+A" },
  search: { deleteFiles: "Delete", ...FILE_HOTKEY_DEFAULTS, selectAll: "Ctrl+A" },
  tagManager: { ...RATING_HOTKEY_DEFAULTS, selectAll: "Ctrl+A" },
};

interface HotkeyEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const normalizeKey = (key: string) => (key === " " ? "space" : key.toLowerCase());

export const getHotkey = ({ altKey, ctrlKey, key, metaKey, shiftKey }: HotkeyEvent) => {
  if (["Alt", "Control", "Meta", "Shift"].includes(key)) return null;
  if (key === "Backspace") return "";

  return [
    ctrlKey ? "Ctrl" : null,
    altKey ? "Alt" : null,
    shiftKey ? "Shift" : null,
    metaKey ? "Meta" : null,
    key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key,
  ]
    .filter(Boolean)
    .join("+");
};

export const getHotkeyRating = (event: HotkeyEvent, hotkeys: RatingHotkeys) => {
  const index = RATING_HOTKEY_KEYS.findIndex((key) => matchesHotkey(event, hotkeys[key]));
  return index < 0 ? null : index + 1;
};

export const matchesHotkey = (event: HotkeyEvent, hotkey: string) => {
  if (!hotkey) return false;

  const parts = hotkey.split("+");
  const key = parts.at(-1);
  return (
    event.altKey === parts.includes("Alt") &&
    event.ctrlKey === parts.includes("Ctrl") &&
    event.metaKey === parts.includes("Meta") &&
    event.shiftKey === parts.includes("Shift") &&
    normalizeKey(event.key) === normalizeKey(key)
  );
};
