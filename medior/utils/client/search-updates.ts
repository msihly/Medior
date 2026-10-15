import type { FileSearch } from "medior/store";

const getFilters = (search: FileSearch) =>
  (search.cachedFilterProps ?? search.getFilterProps()) as Record<string, any>;

/** Items outside the results cannot enter them when their new archive state is filtered out. */
export const canEnterSearch = (search: FileSearch, updates: Record<string, any>) => {
  const filters = getFilters(search);

  return (
    typeof updates.isArchived !== "boolean" ||
    typeof filters.isArchived !== "boolean" ||
    updates.isArchived === filters.isArchived
  );
};

/** Modification dates only matter to searches sorted or filtered by them. */
export const dateModifiedAffectsSearch = (search: FileSearch) => {
  const filters = getFilters(search);

  return (
    (filters.sortValue ?? search.sortValue).key === "dateModified" ||
    !!filters.dateModifiedStart ||
    !!filters.dateModifiedEnd
  );
};

/** Items outside a full first page cannot appear on it when their new sort value orders after its last result. */
export const sortsAfterPage = (search: FileSearch, updates: Record<string, any>) => {
  const { isDesc, key } = getFilters(search).sortValue ?? search.sortValue;
  const lastValue = search.results.at(-1)?.[key];
  const value = updates[key];

  if (search.page !== 1 || search.results.length < search.pageSize) return false;
  if (value === null || value === undefined || lastValue === null || lastValue === undefined)
    return false;

  return isDesc ? value < lastValue : value > lastValue;
};

/** Tag edits only matter to tag-count filters and tag filters that include or descend from the edited tags. */
export const tagChangesAffectSearch = (search: FileSearch, tagIds: string[]) => {
  const changedIds = new Set(tagIds);

  return (
    Boolean(getFilters(search).numOfTags?.logOp) ||
    search.tags.some(
      (tag) =>
        changedIds.has(tag.id) ||
        (tag.searchType?.includes("Desc") && tag.descendantIds?.some((id) => changedIds.has(id))),
    )
  );
};
