import { MODEL_DEFS } from "medior/generator/schema/models";
import { createSearchStore, makeSortDef, makeStoreDef } from "medior/generator/stores/generators";
import { MODEL_SEARCH_STORE_DEFS } from "medior/generator/stores/models";
import { makeSectionComment } from "medior/generator/utils";

const CUSTOM_SORT_OPTIONS: Record<string, string[]> = {
  FileCollectionFile: [
    `{ attribute: "custom", icon: "Settings", label: "Custom" }`,
    `{ attribute: "originalName", icon: "Abc", label: "Original Name" }`,
    `...MODEL_SORT_OPTIONS.File`,
  ],
};

export const FILE_DEF_SORT_OPTIONS: FileDef = {
  name: "sort-options",
  makeFile: async () => {
    const makeImports = () => `import { IconName, IconProps } from "medior/components/media/icon";`;

    const makeCustomSortNameType = () =>
      `type CustomSortName = ${makeSortType(Object.keys(CUSTOM_SORT_OPTIONS))};`;

    const makeCustomSortOpts = () =>
      `const CUSTOM_SORT_OPTIONS: Record<CustomSortName, SortOption[]> = {
        ${Object.entries(CUSTOM_SORT_OPTIONS)
          .map(([key, value]) => `${key}: [${value.join(", ")}]`)
          .join(",\n")}
      };`;

    const makeModelSortNameType = () =>
      `type ModelSortName = ${makeSortType(MODEL_DEFS.map((d) => d.name))};`;

    const makeModelSortOpts = () =>
      `const MODEL_SORT_OPTIONS: Record<ModelSortName, SortOption[]> = { ${MODEL_DEFS.map(makeSortDef).join(",\n")} };`;

    const makeSortTypes = () =>
      `export type SortOption = {
        attribute: string;
        icon: IconName;
        iconProps?: Partial<IconProps>;
        label: string;
      }

      export type SortValue = { isDesc: boolean; key: string; }`;

    const makeSortOpts = () =>
      `export const SORT_OPTIONS = { ...MODEL_SORT_OPTIONS, ...CUSTOM_SORT_OPTIONS };`;

    const makeSortType = (names: string[]) => names.map((name) => `"${name}"`).join(" | ");

    return `${makeImports()}\n
      ${makeSortTypes()}\n
      ${makeModelSortNameType()}\n
      ${makeCustomSortNameType()}\n
      ${makeModelSortOpts()}\n
      ${makeCustomSortOpts()}\n
      ${makeSortOpts()}`;
  },
};

export const FILE_DEF_STORES: FileDef = {
  name: "stores",
  makeFile: async () => {
    const makeImports = () =>
      `import autoBind from "auto-bind";
      import { computed } from "mobx";
      import {
        applySnapshot,
        getRootStore,
        getSnapshot,
        Model,
        model,
        modelAction,
        ModelCreationData,
        modelFlow,
        prop,
      } from "mobx-keystone";
      import * as Types from "medior/server/database/types";
      import { SortMenuProps } from "medior/components";
      import * as Stores from "medior/store";
      import { asyncAction } from "medior/store/utils";
      import { getConfig, toast } from "medior/utils/client";
      import { dayjs, isDeepEqual, LogicalOp } from "medior/utils/common";
      import { makePerfLog, trpc } from "medior/utils/server";`;

    const makeSchemaStores = async () => {
      const storeDefs = [];
      for (const def of MODEL_DEFS) storeDefs.push(await makeStoreDef(def));
      return storeDefs.join("\n");
    };

    const makeSearchStores = () =>
      MODEL_SEARCH_STORE_DEFS.map((def) => createSearchStore(def)).join("\n");

    return `${makeImports()}\n
    ${makeSectionComment("SEARCH STORES")}\n
    ${makeSearchStores()}\n
    ${makeSectionComment("SCHEMA STORES")}\n
    ${await makeSchemaStores()}`;
  },
};
