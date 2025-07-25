import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";
import { SettingsStore } from "medior/store";
import { getConfig } from "medior/utils/client";

@model("medior/HomeStore")
export class HomeStore extends Model({
  fileCardFit: prop<"contain" | "cover">(() => getConfig().file.fileCardFit).withSetter(),
  isDraggingIn: prop<boolean>(false).withSetter(),
  isDraggingOut: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  settings: prop<SettingsStore>(() => new SettingsStore({})),
}) {
  onInit() {
    autoBind(this);
  }
}
