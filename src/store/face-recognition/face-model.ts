import { computed } from "mobx";
import { _async, _await, Model, model, prop } from "mobx-keystone";
import { TagOption } from "store";
import { colors, objectToFloat32Array } from "utils";

@model("mediaViewer/FaceModel")
export class FaceModel extends Model({
  box: prop<{ height: number; width: number; x: number; y: number }>().withSetter(),
  /** JSON representation of Float32Array[] */
  descriptors: prop<string>().withSetter(),
  fileId: prop<string>().withSetter(),
  tagId: prop<string | null>(null).withSetter(),
  selectedTag: prop<TagOption | null>(null).withSetter(),
}) {
  @computed
  get boxColor() {
    return this.selectedTag === null
      ? colors.red["600"]
      : this.selectedTag?.id !== this.tagId
      ? colors.blue["600"]
      : colors.green["600"];
  }

  @computed
  get descriptorsFloat32(): Float32Array[] {
    try {
      return (JSON.parse(this.descriptors) as object[]).map(objectToFloat32Array);
    } catch (err) {
      console.error(err);
      return null;
    }
  }
}
