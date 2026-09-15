import type { FileCollectionSearch, FileSearch, TagSearch } from "medior/store";

const FILTER_DEPENDENCIES: Record<string, string[]> = {
  aliases: ["alias"],
  ancestorIds: ["excludedDescTagIds", "requiredDescTagIds"],
  audioCodec: ["selectedAudioCodecs"],
  collectionIds: ["numOfCollections"],
  dateCreated: ["dateCreatedEnd", "dateCreatedStart"],
  dateImported: ["dateImportedEnd", "dateImportedStart"],
  dateModified: ["dateModifiedEnd", "dateModifiedStart"],
  dateOfInception: ["dateOfInceptionEnd", "dateOfInceptionStart"],
  diffusionParams: ["diffusionParams", "hasDiffParams"],
  ext: ["selectedImageExts", "selectedVideoExts"],
  hash: ["isModified"],
  height: ["maxHeight", "maxLongEdge", "maxShortEdge", "minHeight", "minLongEdge", "minShortEdge"],
  id: ["excludedFileIds", "ids"],
  originalHash: ["isModified"],
  regEx: ["hasRegEx"],
  size: ["maxSize", "minSize", "size"],
  tagIds: [
    "excludedDescTagIds",
    "excludedTagIds",
    "numOfTags",
    "optionalTagIds",
    "requiredDescTagIds",
    "requiredTagIds",
  ],
  tagIdsWithAncestors: ["excludedDescTagIds", "requiredDescTagIds"],
  transcription: ["isTranscribed", "transcription"],
  videoCodec: ["selectedVideoCodecs"],
  width: ["maxLongEdge", "maxShortEdge", "maxWidth", "minLongEdge", "minShortEdge", "minWidth"],
};

export const updatesAffectSearch = (
  search: FileCollectionSearch | FileSearch | TagSearch,
  updatedKeys: string[],
) => {
  const filters = (search.cachedFilterProps ?? search.getFilterProps()) as Record<string, any>;
  return updatedKeys.some(
    (key) =>
      key === (filters.sortValue ?? search.sortValue).key ||
      (FILTER_DEPENDENCIES[key] ?? [key]).some((filterKey) => {
        const value = filters[filterKey];
        if (value === null || value === undefined || value === "") return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object")
          return "logOp" in value ? Boolean(value.logOp) : Object.values(value).includes(false);
        if (typeof value === "boolean")
          return (
            value ||
            ["hasRegEx", "isArchived", "isCorrupted", "isModified", "isTranscribed"].includes(
              filterKey,
            )
          );
        return true;
      }),
  );
};
