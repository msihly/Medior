import { computed } from "mobx";
import { Model, model, prop } from "mobx-keystone";
import { TagOption } from "medior/store";
import { colors, objectToFloat32Array } from "medior/utils";

@model("medior/FaceModel")
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
      ? colors.custom.red
      : this.selectedTag?.id !== this.tagId
      ? colors.custom.blue
      : colors.custom.green;
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
