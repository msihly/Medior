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

/** Exact matches the whole text, word matches separate words, and partial matches anywhere. */
export type TagRegExTermMode = "exact" | "partial" | "word";

export interface TagRegExTerm {
  mode: TagRegExTermMode;
  term: string;
}

const SEPARATOR_PATTERN = "[\\s\\-_\\.]+";
const WORD_END_PATTERN = "(?![^\\W_])";
const WORD_START_PATTERN = "(?<![^\\W_])";

export const normalizeTagRegExKey = (label: string) =>
  label.replace(/[\s_.-]+/g, " ").toUpperCase();

/** The first run of letters and digits indexes whole-word terms by a word the input must contain. */
const getFirstWordKey = (text: string) => text.match(/[^\W_]+/)?.[0].toUpperCase() ?? null;

const termToPattern = ({ mode, term }: TagRegExTerm) => {
  const literal = Fmt.regexEscape(term.trim()).replaceAll(/[\s-_]+/g, SEPARATOR_PATTERN);

  if (mode === "exact") return `^${literal}$`;
  else if (mode === "word") return `${WORD_START_PATTERN}${literal}${WORD_END_PATTERN}`;
  else return literal;
};

/** Stores one group per term, then the custom pattern, so the editor can read the terms back. */
export const makeTagRegEx = (terms: TagRegExTerm[], custom = "") =>
  [...terms.filter(({ term }) => term.trim()).map((term) => `(${termToPattern(term)})`), custom]
    .filter(Boolean)
    .join("|");

/** Reads a literal written by termToPattern, returning where it ends, or null at a regex token. */
const readTermLiteral = (source: string, start: number) => {
  let literal = "";
  let idx = start;

  while (idx < source.length) {
    if (source.startsWith(SEPARATOR_PATTERN, idx)) {
      literal += " ";
      idx += SEPARATOR_PATTERN.length;
    } else if (source[idx] === "\\") {
      const escaped = source[idx + 1];
      if (!escaped || !".*+?^${}()|[]\\/".includes(escaped)) return null;

      literal += escaped;
      idx += 2;
    } else if (".*+?^${}()|[]".includes(source[idx])) break;
    else literal += source[idx++];
  }

  return literal ? { end: idx, literal } : null;
};

/** Reads one term group at the start of the source, or returns null when it is not one. */
const readTermGroup = (source: string): { length: number; term: TagRegExTerm } => {
  if (!source.startsWith("(")) return null;

  const [mode, prefix, suffix]: [TagRegExTermMode, string, string] = source.startsWith("(^")
    ? ["exact", "^", "$"]
    : source.startsWith(`(${WORD_START_PATTERN}`)
      ? ["word", WORD_START_PATTERN, WORD_END_PATTERN]
      : ["partial", "", ""];

  const read = readTermLiteral(source, 1 + prefix.length);
  if (!read || !source.startsWith(`${suffix})`, read.end)) return null;

  const length = read.end + suffix.length + 1;
  if (length < source.length && source[length] !== "|") return null;

  return { length, term: { mode, term: read.literal } };
};

/** Splits a stored pattern into the term groups written by makeTagRegEx and a custom remainder. */
export const parseTagRegEx = (source: string) => {
  const groups: { source: string; term: TagRegExTerm }[] = [];
  let rest = source ?? "";

  while (rest) {
    const group = readTermGroup(rest);
    if (!group) break;

    groups.push({ source: rest.slice(0, group.length), term: group.term });
    rest = rest.slice(group.length + 1);
  }

  return { custom: rest, groups };
};

export class TagRegExMatcher {
  private fallbackMaps: TagRegExMap[] = [];
  private indexedMaps = new Map<string, TagRegExMap[]>();
  private maps: TagRegExMap[] = [];
  private positions = new Map<TagRegExMap, number>();
  private tagIds = new Set<string>();
  private wordMaps = new Map<string, TagRegExMap[]>();

  add(map: TagRegExMap) {
    if (this.tagIds.has(map.tagId)) return;

    this.tagIds.add(map.tagId);
    this.positions.set(map, this.maps.length);
    this.maps.push(map);

    const { custom, groups } = parseTagRegEx(map.regEx.source);

    // Partial and custom patterns can match anywhere, so they are always tested.
    if (
      /[^im]/.test(map.regEx.flags) ||
      custom ||
      groups.some(
        ({ term }) =>
          term.mode === "partial" || (term.mode === "word" && !getFirstWordKey(term.term)),
      )
    )
      this.fallbackMaps.push(map);
    else
      for (const { term } of groups) {
        const [maps, key] =
          term.mode === "exact"
            ? [this.indexedMaps, normalizeTagRegExKey(term.term)]
            : [this.wordMaps, getFirstWordKey(term.term)];

        if (!maps.has(key)) maps.set(key, []);

        maps.get(key).push(map);
      }
  }

  async match(label: string, checkpoint: () => Promise<void>) {
    // Multiline patterns may match across several lines; retain full regex semantics for those inputs.
    const candidates = /[\r\n\u2028\u2029]/.test(label)
      ? this.maps
      : [
          ...new Set([
            ...(this.indexedMaps.get(normalizeTagRegExKey(label)) ?? []),
            ...[...new Set(label.toUpperCase().match(/[^\W_]+/g))].flatMap(
              (word) => this.wordMaps.get(word) ?? [],
            ),
            ...this.fallbackMaps,
          ]),
        ];

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
  makeTagRegEx(
    tags.flatMap((tag) =>
      [tag.label, ...(tag.aliases ?? [])].map((term) => ({ mode: "exact" as const, term })),
    ),
  );
