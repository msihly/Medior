import { applySnapshot, Instance, types } from "mobx-state-tree";

type DrawerMode = "persistent" | "temporary";

export const defaultAppStore = {
  drawerMode: "persistent" as DrawerMode,
  isDrawerOpen: false,
};

export const AppStoreModel = types
  .model("AppStore")
  .props({
    drawerMode: types.enumeration<DrawerMode>(["persistent", "temporary"]),
    isDrawerOpen: types.boolean,
  })
  .actions((self) => ({
    reset: () => {
      applySnapshot(self, defaultAppStore);
    },
    setIsDrawerOpen: (isOpen: boolean) => {
      self.isDrawerOpen = isOpen;
    },
    toggleDrawerMode: () => {
      self.drawerMode = self.drawerMode === "persistent" ? "temporary" : "persistent";
    },
  }));

export interface AppStore extends Instance<typeof AppStoreModel> {}
