import { ExtendedModel, model } from "mobx-keystone";
import { ImportEditorStore } from "./import-editor-store";

@model("medior/Ingester")
export class Ingester extends ExtendedModel(ImportEditorStore, {}) {}
