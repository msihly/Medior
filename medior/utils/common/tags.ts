import { Fmt } from "trabecula/utils/common";

export const makeTagSelector = <T extends { id: string }>(tags: T[]) => {
  const byId = new Map(tags.map((tag, index) => [tag.id, { index, tag }]));

  return (ids: string[]) =>
    [...new Set(ids)]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)
      .map(({ tag }) => tag);
};

export const preferredTagLabel = (a: string, b: string) => {
  const rank = (label: string) =>
    label[0] !== label[0]?.toLowerCase() ? 2 : label !== label.toLowerCase() ? 1 : 0;

  return rank(b) > rank(a) ? b : a;
};

export const mergeTagDefinitions = <
  T extends {
    aliases?: string[];
    id?: string;
    label: string;
    parentLabels?: string[];
    withRegEx?: boolean;
  },
>(
  tags: T[],
): T[] => {
  const labels = new Map<string, string>();
  const merged = new Map<string, T>();

  for (const tag of tags) {
    for (const label of [tag.label, ...(tag.parentLabels ?? [])]) {
      const key = label.toLowerCase();

      labels.set(key, preferredTagLabel(labels.get(key) ?? label, label));
    }

    const key = tag.label.toLowerCase();
    const previous = merged.get(key);

    if (!previous) merged.set(key, { ...tag });
    else
      merged.set(key, {
        ...tag,
        ...Object.fromEntries(Object.entries(previous).filter(([, value]) => value !== undefined)),
        ...(previous.aliases || tag.aliases
          ? { aliases: [...new Set([...(previous.aliases ?? []), ...(tag.aliases ?? [])])] }
          : {}),
        id: previous.id ?? tag.id,
        ...(previous.parentLabels || tag.parentLabels
          ? {
              parentLabels: [
                ...new Set([...(previous.parentLabels ?? []), ...(tag.parentLabels ?? [])]),
              ],
            }
          : {}),
        withRegEx: previous.withRegEx || tag.withRegEx,
      });
  }

  return [...merged.values()].map((tag) => ({
    ...tag,
    label: labels.get(tag.label.toLowerCase()),
    ...(tag.parentLabels
      ? {
          parentLabels: [
            ...new Set(tag.parentLabels.map((label) => labels.get(label.toLowerCase()))),
          ],
        }
      : {}),
  }));
};

export interface TagRegExMap {
  regEx: RegExp;
  tagId: string;
}

const normalizeTagRegExKey = (label: string) => label.replace(/[\s_.-]+/g, " ").toUpperCase();

/** Recognize the anchored literal alternatives emitted by tagsToRegEx; other patterns stay regexes. */
const getTagRegExKeys = (regEx: RegExp) => {
  if (/[^im]/.test(regEx.flags) || !regEx.source.startsWith("(^") || !regEx.source.endsWith("$)"))
    return null;

  const keys = new Set<string>();

  for (const alternative of regEx.source.slice(1, -1).split(")|(")) {
    if (!alternative.startsWith("^") || !alternative.endsWith("$")) return null;

    const pattern = alternative.slice(1, -1);
    let literal = "";

    for (let idx = 0; idx < pattern.length; idx++) {
      const separator = "[\\s\\-_\\.]+";

      if (pattern.startsWith(separator, idx)) {
        literal += " ";
        idx += separator.length - 1;
      } else if (pattern[idx] === "\\") {
        const escaped = pattern[++idx];

        if (!escaped || !".*+?^${}()|[]\\/".includes(escaped)) return null;

        literal += escaped;
      } else {
        if (".*+?^${}()|[]".includes(pattern[idx])) return null;

        literal += pattern[idx];
      }
    }

    keys.add(normalizeTagRegExKey(literal));
  }

  return keys;
};

export class TagRegExMatcher {
  private fallbackMaps: TagRegExMap[] = [];
  private indexedMaps = new Map<string, TagRegExMap[]>();
  private maps: TagRegExMap[] = [];
  private positions = new Map<TagRegExMap, number>();
  private tagIds = new Set<string>();

  add(map: TagRegExMap) {
    if (this.tagIds.has(map.tagId)) return;

    this.tagIds.add(map.tagId);
    this.positions.set(map, this.maps.length);
    this.maps.push(map);

    const keys = getTagRegExKeys(map.regEx);

    if (!keys) this.fallbackMaps.push(map);
    else
      for (const key of keys) {
        if (!this.indexedMaps.has(key)) this.indexedMaps.set(key, []);

        this.indexedMaps.get(key).push(map);
      }
  }

  async match(label: string, checkpoint: () => Promise<void>) {
    // Multiline patterns may match across several lines; retain full regex semantics for those inputs.
    const candidates = /[\r\n\u2028\u2029]/.test(label)
      ? this.maps
      : [...(this.indexedMaps.get(normalizeTagRegExKey(label)) ?? []), ...this.fallbackMaps];

    const matches: TagRegExMap[] = [];

    for (let idx = 0; idx < candidates.length; idx++) {
      if (idx % 128 === 0) await checkpoint();

      const map = candidates[idx];

      if (map.regEx.test(label)) matches.push(map);
    }

    return matches.sort((a, b) => this.positions.get(a) - this.positions.get(b));
  }
}

export const tagsToRegEx = (tags: { aliases?: string[]; label: string }[]) =>
  `(${tags
    .flatMap((tag) => [tag.label, ...(tag.aliases ?? [])])
    .map((s) => `^${Fmt.regexEscape(s).replaceAll(/[\s-_]+/g, "[\\s\\-_\\.]+")}$`)
    .join(")|(")})`;
