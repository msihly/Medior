import { TagModel } from "medior/_generated/server/models";
import { loadTagGraph } from "./tag-ancestry";

interface TagRelationships {
  childIds?: string[];
  id: string;
  parentIds?: string[];
}

/** Validate all proposed edges together before publishing any relationship writes. */
export const assertTagRelationships = async (
  changes: TagRelationships[],
  removedIds: string[] = [],
) => {
  if (
    !removedIds.length &&
    changes.every(({ childIds, parentIds }) => childIds === undefined && parentIds === undefined)
  )
    return;

  const children = await TagModel.find({ parentIds: { $in: changes.map(({ id }) => id) } })
    .select({ _id: 1 })
    .lean();

  const ids = [
    ...new Set([
      ...changes.flatMap(({ childIds = [], id, parentIds = [] }) => [
        id,
        ...childIds,
        ...parentIds,
      ]),
      ...children.map((tag) => String(tag._id)),
    ]),
  ];
  const graph = await loadTagGraph(ids, false);
  const childrenByParent = new Map<string, Set<string>>();

  for (const [childId, parents] of graph) {
    for (const parentId of parents) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, new Set());

      childrenByParent.get(parentId).add(childId);
    }
  }

  const edges = new Map<string, Map<string, boolean>>();

  const changeEdge = (childId: string, parentId: string, add: boolean) => {
    if (!edges.has(childId)) edges.set(childId, new Map());

    const parents = edges.get(childId);

    if (parents.has(parentId) && parents.get(parentId) !== add)
      throw new Error("The same tag relationship cannot be added and removed together.");

    parents.set(parentId, add);
  };

  for (const { childIds, id, parentIds } of changes) {
    if (!graph.has(id)) graph.set(id, []);

    if (parentIds !== undefined) {
      const previous = new Set(graph.get(id));
      const parents = new Set(parentIds);

      for (const parentId of parents) {
        if (!previous.has(parentId)) changeEdge(id, parentId, true);
      }

      for (const parentId of previous) {
        if (!parents.has(parentId)) changeEdge(id, parentId, false);
      }
    }

    if (childIds !== undefined) {
      const previous = childrenByParent.get(id) ?? new Set<string>();
      const children = new Set(childIds);

      for (const childId of children) {
        if (!previous.has(childId)) changeEdge(childId, id, true);
      }

      for (const childId of previous) {
        if (!children.has(childId)) changeEdge(childId, id, false);
      }
    }
  }

  for (const [childId, changes] of edges) {
    if (!graph.has(childId)) throw new Error("A related tag no longer exists.");

    const parents = new Set(graph.get(childId));

    for (const [parentId, add] of changes) {
      if (add) parents.add(parentId);
      else parents.delete(parentId);
    }

    graph.set(childId, [...parents]);
  }

  const removed = new Set(removedIds);

  for (const id of removed) graph.delete(id);

  for (const [id, parents] of graph)
    graph.set(
      id,
      parents.filter((parent) => !removed.has(parent)),
    );

  const completed = new Set<string>();
  const visiting = new Set<string>();

  for (const root of graph.keys()) {
    const pending = [{ id: root, leave: false }];

    while (pending.length) {
      const { id, leave } = pending.pop();

      if (leave) {
        visiting.delete(id);
        completed.add(id);
      } else if (!completed.has(id)) {
        if (visiting.has(id))
          throw new Error("These relationships would create a tag hierarchy cycle.");

        if (!graph.has(id)) throw new Error("A related tag no longer exists.");

        visiting.add(id);
        pending.push({ id, leave: true });

        for (const parent of graph.get(id)) pending.push({ id: parent, leave: false });
      }
    }
  }
};
