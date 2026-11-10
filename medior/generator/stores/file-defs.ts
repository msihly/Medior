import { MODEL_DEFS } from "medior/generator/schema/models";
import { createSearchStore, makeSortDef, makeStoreDef } from "medior/generator/stores/generators";
import { MODEL_SEARCH_STORE_DEFS } from "medior/generator/stores/models";
import { makeSectionComment } from "medior/generator/utils";

const CUSTOM_SORT_OPTION = `{ attribute: "custom", icon: "Settings", label: "Custom" }`;

/** Seasons keep their episodes in number order, which their custom sort shows. */
const EPISODE_NUMBER_SORT_OPTION = `{ attribute: "custom", icon: "FormatListNumbered", label: "Number" }`;

/** Tracks sort by their music tags as well as their files' own details. */
const MUSIC_TRACK_SORT_OPTIONS = [
  `{ attribute: "music.artist", icon: "Person", label: "Artist" }`,
  `{ attribute: "music.title", icon: "Title", label: "Title" }`,
  `{ attribute: "music.album", icon: "Album", label: "Album" }`,
  `{ attribute: "music.year", icon: "CalendarMonth", label: "Year" }`,
];

const CUSTOM_SORT_OPTIONS: Record<string, string[]> = {
  FileCollectionFile: [CUSTOM_SORT_OPTION, `...MODEL_SORT_OPTIONS.File`],
  MediaProgramEpisode: [EPISODE_NUMBER_SORT_OPTION, `...MODEL_SORT_OPTIONS.File`],
  MediaProgramRanking: [CUSTOM_SORT_OPTION, `...MODEL_SORT_OPTIONS.MediaProgram`],
  MusicTrack: [...MUSIC_TRACK_SORT_OPTIONS, `...MODEL_SORT_OPTIONS.File`],
};

export const FILE_DEF_SORT_OPTIONS: FileDef = {
  name: "sort-options",
  makeFile: async () => {
    const makeImports = () => `import { IconName, IconProps } from "trabecula/components";`;

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
      import { computed, reaction } from "mobx";
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
      import { IconName, SortMenuProps } from "medior/components";
      import * as Stores from "medior/store";
      import { asyncAction, CssColor, derefMobx, toast } from "medior/utils/client";
      import {
        applySelectionChanges,
        dayjs,
        getSelectionRange,
        isDeepEqual,
        LogicalOp,
        makeTagSelector,
      } from "medior/utils/common";
      import { getConfig, rpc } from "medior/utils/server";`;

    const makeSchemaStores = async () => {
      const storeDefs = [];

      for (const def of MODEL_DEFS) storeDefs.push(await makeStoreDef(def));

      return storeDefs.join("\n");
    };

    const makeSearchStores = () =>
      MODEL_SEARCH_STORE_DEFS.map((def) => createSearchStore(def)).join("\n\n");

    return `${makeImports()}\n
    ${makeSectionComment("SEARCH STORES")}\n
    ${makeSearchStores()}\n
    ${makeSectionComment("SCHEMA STORES")}\n
    ${await makeSchemaStores()}`;
  },
};
