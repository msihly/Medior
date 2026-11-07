import { KeyboardEvent } from "react";
import { selectAllInView, SelectionButtonsProps } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { getHotkeyRating, matchesHotkey } from "medior/utils/common";

export interface UseMediaProgramHotkeysProps {
  /** Plural name of the selectable items, such as "programs". */
  itemLabel: string;
  rate: (id: string, rating: number) => Promise<{ error?: string; success: boolean }>;
  search: SelectionButtonsProps["store"];
}

/**
 * The Media Programs hotkeys: Select All in View, and ratings for the one selected item, as the
 * Tag Manager's work.
 */
export const useMediaProgramHotkeys = ({
  itemLabel,
  rate,
  search,
}: UseMediaProgramHotkeysProps) => {
  const stores = useStores();
  const hotkeys = stores.home.settings.hotkeys.mediaPrograms;

  const handleKeyPress = async (event: KeyboardEvent) => {
    if (matchesHotkey(event, hotkeys.selectAll)) {
      event.preventDefault();
      selectAllInView({ itemLabel, store: search, toast });
    } else {
      const rating = getHotkeyRating(event, hotkeys);
      if (!rating || search.selectedIds.length !== 1) return;

      event.preventDefault();

      const res = await rate(search.selectedIds[0], rating);
      if (!res.success) toast.error(res.error);
    }
  };

  return handleKeyPress;
};
