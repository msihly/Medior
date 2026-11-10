import { createContext } from "react";

export interface LabelBox {
  left: number;
  width: number;
}

export interface LabelColumns {
  /** The width of the widest label in the same column as this one. */
  getWidth: (id: string) => number;
  removeLabel: (id: string) => void;
  setLabel: (id: string, label: LabelBox) => void;
}

/** Widens each field label to the widest label in its column, so the controls beside them line up. */
export const LabelColumnsContext = createContext<LabelColumns>(null);
