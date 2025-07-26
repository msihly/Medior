import autoBind from "auto-bind";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { Tag } from "medior/store/tags/tag";
import { asyncAction } from "medior/store/utils";
import { trpc } from "medior/utils/server";

@model("medior/TagEditorStore")
export class TagEditorStore extends Model({
  aliases: prop<string[]>(() => []).withSetter(),
  childTags: prop<Tag[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  parentTags: prop<Tag[]>(() => []).withSetter(),
  regExValue: prop<string>("").withSetter(),
  regExTestString: prop<string>("").withSetter(),
  tag: prop<Tag>(null).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.aliases = [];
    this.childTags = [];
    this.isLoading = false;
    this.label = "";
    this.parentTags = [];
    this.regExValue = "";
    this.regExTestString = "";
    this.tag = null;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadTag = asyncAction(async (id: string) => {
    this.setIsLoading(true);

    const res = await trpc.getTagWithRelations.mutate({ id });
    if (!res.success) throw new Error(res.error);

    const tag = res.data.tag;
    this.setTag(new Tag(tag));
    this.setChildTags(res.data.childTags.map((t) => new Tag(t)));
    this.setParentTags(res.data.parentTags.map((t) => new Tag(t)));

    this.setAliases(tag.aliases);
    this.setLabel(tag.label);
    this.setRegExTestString("");
    this.setRegExValue(tag.regEx);

    this.setIsLoading(false);
  });
}
