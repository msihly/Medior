export const collectRelatedTagIds = (
  graph: ReadonlyMap<string, readonly string[]>,
  ids: string[],
  withBaseId = true,
) => {
  const related = new Set<string>();
  const roots = ids.filter((id) => graph.has(id));
  const pending = withBaseId ? roots : roots.flatMap((id) => graph.get(id));

  while (pending.length) {
    const id = pending.pop();
    if (related.has(id) || !graph.has(id)) continue;

    related.add(id);
    for (const next of graph.get(id)) {
      if (!related.has(next)) pending.push(next);
    }
  }

  return [...related];
};
