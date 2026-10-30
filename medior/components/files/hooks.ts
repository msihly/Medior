import { getCurrentWebContents } from "@electron/remote";
import { File, useStores } from "medior/store";
import { openCarouselWindow, toast } from "medior/utils/client";
import { rpc } from "medior/utils/server";

type TileSelect = (args: {
  hasCtrl: boolean;
  hasShift: boolean;
  id: string;
}) => Promise<{ error?: string; success: boolean }>;

/** Selects a tile on click, with Ctrl toggling it and Shift selecting a range. */
export const makeTileClickHandler =
  ({ disabled, id, select }: { disabled?: boolean; id: string; select: TileSelect }) =>
  async (event: React.MouseEvent) => {
    if (disabled) return;

    const res = await select({ hasCtrl: event.ctrlKey, hasShift: event.shiftKey, id });

    if (!res?.success) toast.error(res.error);
  };

/** Opens the carousel on a file with every file in the search. */
export const openSearchCarousel = async (
  file: File,
  search: {
    listIdsForCarousel: () => Promise<{ data?: string[]; error?: string; success: boolean }>;
  },
) => {
  const res = await search.listIdsForCarousel();

  if (!res?.success) console.error(res.error);
  else openCarouselWindow({ file, selectedFileIds: res.data });
};

export const startFileDrag = (item: Parameters<Electron.WebContents["startDrag"]>[0]) => {
  try {
    getCurrentWebContents().startDrag(item);
  } catch (error) {
    console.error(error);
    toast.error("File drag failed");
  }
};

export const useFileDrag = (file: File, selectedIds: string[]) => {
  const stores = useStores();

  const loadSelectedFiles = async () => {
    const res = await rpc.listFile({ args: { filter: { id: selectedIds } } });

    if (!res?.success) throw new Error(res.error);

    return res.data.items;
  };

  const onDragEnd = () => stores.home.setIsDraggingOut(false);

  const onDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    try {
      const hasSelected = selectedIds.includes(file.id);
      const files = hasSelected ? await loadSelectedFiles() : null;
      if (hasSelected && !files.length) throw new Error("No selected files found");

      const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
      const icon = hasSelected ? files[0].thumb.path : file.thumb.path;

      startFileDrag({ file: file.path, files: filePaths, icon });
    } catch (error) {
      stores.home.setIsDraggingOut(false);
      toast.error(error.message);
    }
  };

  return { onDragEnd, onDragStart };
};
