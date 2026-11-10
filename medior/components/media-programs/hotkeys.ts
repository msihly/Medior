import { KeyboardEvent } from "react";
import { selectAllInView, SelectionButtonsProps } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getHotkeyRating, Hotkeys, matchesHotkey } from "medior/utils/common";

export interface UseMediaProgramHotkeysProps {
  /** The Hotkeys settings tab whose keys apply, which the music view has its own of. */
  hotkeyGroup?: keyof Pick<Hotkeys, "mediaPrograms" | "music">;
  /** Plural name of the selectable items, such as "programs". */
  itemLabel: string;
  /** Rates the one selected item. Without it, as for items rated by their tracks, keys don't. */
  rate?: (id: string, rating: number) => Promise<{ error?: string; success: boolean }>;
  search: SelectionButtonsProps["store"];
  /** What Select All in View selects, when the view shows more than the search's results. */
  selection?: SelectionButtonsProps<"results" | "toggleSelected">["store"];
}

/**
 * The Media Programs and music hotkeys: Select All in View, and ratings for the one selected item,
 * as the Tag Manager's work.
 */
export const useMediaProgramHotkeys = ({
  hotkeyGroup = "mediaPrograms",
  itemLabel,
  rate,
  search,
  selection,
}: UseMediaProgramHotkeysProps) => {
  const stores = useStores();
  const hotkeys = stores.home.settings.hotkeys[hotkeyGroup];

  const handleKeyPress = async (event: KeyboardEvent) => {
    if (matchesHotkey(event, hotkeys.selectAll)) {
      event.preventDefault();
      selectAllInView({ itemLabel, store: selection ?? search, toast });
    } else {
      const rating = getHotkeyRating(event, hotkeys);
      if (!rating || !rate || search.selectedIds.length !== 1) return;

      event.preventDefault();

      const res = await rate(search.selectedIds[0], rating);
      if (!res.success) toast.error(res.error);
    }
  };

  return handleKeyPress;
};
