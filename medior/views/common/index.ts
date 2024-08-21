import { AppWrapper } from "./app-wrapper";
import { CollectionModals } from "./collection-modals";
import { FileModals } from "./file-modals";
import { ImportDnD } from "./import-dnd";
import { ImportModals } from "./import-modals";
import { MuiProvider } from "./mui-provider";
import { Search } from "./search";
import { StoreProvider } from "./store-provider";
import { TagModals } from "./tag-modals";

export { useHotkeys } from "./hotkeys";
export { useSockets } from "./sockets";

export const Views = {
  AppWrapper,
  CollectionModals,
  FileModals,
  ImportDnD,
  ImportModals,
  MuiProvider,
  Search,
  StoreProvider,
  TagModals,
};
