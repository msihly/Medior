import { getCurrentWebContents } from "@electron/remote";
import { useStores } from "medior/store";
import { File } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const useFileDrag = (file: File, selectedIds: string[]) => {
  const stores = useStores();

  const loadSelectedFiles = async () => {
    const res = await trpc.listFile.mutate({ args: { filter: { id: selectedIds } } });
    if (!res?.success) throw new Error(res.error);
    return res.data.items;
  };

  const onDragEnd = () => stores.home.setIsDraggingOut(false);

  const onDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    const hasSelected = selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumb.path : file.thumb.path;

    try {
      getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
    } catch (error) {
      console.error(error), toast.error("File drag failed");
    }
  };

  return { onDragEnd, onDragStart };
};
