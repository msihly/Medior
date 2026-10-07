import type { TagSchema } from "medior/_generated/server/models";

export type TagCategorySource = Pick<TagSchema, "category" | "id" | "parentIds">;

export const resolveTagCategory = (
  tag: TagCategorySource,
  tags: ReadonlyMap<string, TagCategorySource>,
): TagSchema["category"] => {
  const category = {
    color: tag.category?.color || null,
    icon: tag.category?.icon || null,
    inheritable: tag.category?.inheritable ?? false,
    sortRank: tag.category?.sortRank ?? null,
  };
  const visited = new Set([tag.id]);
  const parentIds = new Set((tag.parentIds ?? []).map(String));

  while (parentIds.size && (!category.color || !category.icon || category.sortRank == null)) {
    const parents = [...parentIds]
      .filter((id) => !visited.has(id))
      .map((id) => tags.get(id))
      .filter(Boolean)
      .sort(
        (a, b) =>
          (b.category?.sortRank ?? -Infinity) - (a.category?.sortRank ?? -Infinity) ||
          a.id.localeCompare(b.id),
      );

    parentIds.clear();

    for (const parent of parents) {
      if (visited.has(parent.id)) continue;

      visited.add(parent.id);

      for (const id of parent.parentIds ?? []) parentIds.add(String(id));

      if (!parent.category?.inheritable) continue;

      category.color ||= parent.category.color || null;
      category.icon ||= parent.category.icon || null;
      category.sortRank ??= parent.category.sortRank;
    }
  }

  return category;
};
