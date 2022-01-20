import { applySnapshot, Instance, types } from "mobx-state-tree";

export const defaultAppStore = {
  drawerMode: "persistent",
  isDrawerOpen: false,
};

export const AppStoreModel = types
  .model("AppStore")
  .props({
    drawerMode: types.enumeration(["persistent", "temporary"]),
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

type AppStoreType = Instance<typeof AppStoreModel>;
export interface AppStore extends AppStoreType {}
