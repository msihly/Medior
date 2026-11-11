import { setObj } from "trabecula/utils/common";

export const addRegexSearchFilter = (
  filter: Record<string, any>,
  path: string[],
  input: string,
) => {
  const elementIndex = path.indexOf("$elemMatch");
  const terms = splitRegexSearchTerms(input).map((term) => new RegExp(term, "i"));

  if (terms.length === 1) {
    setObj(filter, path, terms[0]);
  } else if (terms.length > 1) {
    if (elementIndex >= 0 && path.length > elementIndex + 2) {
      // All terms in a nested path must match the same array element.
      setObj(filter, path.slice(0, elementIndex + 1), {
        $and: terms.map((term) => setObj({}, path.slice(elementIndex + 1), term)),
      });
    } else {
      (filter.$and ??= []).push(...terms.map((term) => setObj({}, path, term)));
    }
  }
};

/** Steps a three-way filter from either (null) to yes, no, and back to either. */
export const cycleTriState = (value: boolean | null) =>
  value === true ? false : value === false ? null : true;

/**
 * `$and` clauses that match each search term, split as `addRegexSearchFilter` splits them, in any
 * of the fields.
 */
export const makeRegexSearchClauses = (fields: string[], input: string) =>
  splitRegexSearchTerms(input).map((term) => ({
    $or: fields.map((field) => ({ [field]: { $regex: new RegExp(term, "i") } })),
  }));

/**
 * Moves the selected items up to `delta` places up or down, keeping their order among themselves
 * and stopping at the list's ends. The other items keep their order around them.
 */
export const moveSelectedItems = <T>(
  items: T[],
  isSelected: (item: T) => boolean,
  { delta, down }: { delta: number; down: boolean },
) => {
  const moved = Array<T>(items.length);
  const selectedItems = items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => isSelected(item));

  let boundary = down ? moved.length : -1;

  if (down) selectedItems.reverse();

  for (const { index, item } of selectedItems) {
    const toIndex = down
      ? Math.min(index + delta, boundary - 1)
      : Math.max(index - delta, boundary + 1);

    moved[toIndex] = item;
    boundary = toIndex;
  }

  let nextIndex = 0;

  for (const item of items) {
    if (isSelected(item)) continue;

    while (moved[nextIndex] !== undefined) nextIndex++;

    moved[nextIndex++] = item;
  }

  return moved;
};

const splitRegexSearchTerms = (input: string) => {
  const terms: string[] = [];
  let depth = 0;
  let hasBackreference = false;
  let isEscaped = false;
  let isInClass = false;
  let term = "";

  for (let index = 0; index < input.length; index++) {
    const character = input[index];

    if (isEscaped) {
      hasBackreference ||=
        !isInClass && (/[1-9]/.test(character) || (character === "k" && input[index + 1] === "<"));
      isEscaped = false;
      term += character;
    } else if (character === "\\") {
      isEscaped = true;
      term += character;
    } else if (isInClass) {
      if (character === "]") isInClass = false;

      term += character;
    } else if (character === "[") {
      isInClass = true;
      term += character;
    } else if (character === "(") {
      depth++;
      term += character;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
      term += character;
    } else if (depth === 0 && /\s/.test(character)) {
      if (term) terms.push(term);

      term = "";
    } else {
      term += character;
    }
  }

  if (term) terms.push(term);

  // Backreferences can depend on captures across spaces, so retain the complete expression.
  return hasBackreference ? [input] : [...new Set(terms)];
};
