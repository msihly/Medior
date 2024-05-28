import { logToFile } from "./logging";

export const arrayIntersect = <T>(...arrays: T[][]): T[] =>
  [...arrays].reduce((acc, cur) => acc.filter((e) => cur.includes(e)));

export const bisectArrayChanges = <T>(oldArr: T[], newArr: T[]) => {
  if (!oldArr || !newArr) {
    logToFile("error", "bisectArrayChanges: oldArr or newArr is undefined");
    return { added: [], removed: [] };
  } else
    return getArrayDiff(oldArr, newArr).reduce(
      (acc, cur) => {
        acc[newArr.includes(cur) ? "added" : "removed"].push(cur);
        return acc;
      },
      { added: [], removed: [] } as { added: T[]; removed: T[] }
    );
};

export const centeredSlice = <T>(arr: T[], indexToCenter: number, maxCount?: number): T[] => {
  if (!arr || indexToCenter < 0 || indexToCenter > arr.length - 1) return null;

  const count = Math.min(arr.length, maxCount ?? arr.length);
  const delta = Math.floor(count / 2);
  const isEven = count % 2 === 0;

  const startIndex = indexToCenter - delta;
  const left =
    startIndex < 0
      ? [...arr.slice(startIndex), ...arr.slice(0, indexToCenter)]
      : arr.slice(startIndex, indexToCenter);

  const endIndex = indexToCenter + delta;
  const right =
    endIndex > arr.length - 1
      ? [
          ...arr.slice(indexToCenter + 1, arr.length),
          ...arr.slice(0, Math.abs(arr.length - (isEven ? 0 : 1) - endIndex)),
        ]
      : arr.slice(indexToCenter + 1, endIndex + (isEven ? 0 : 1));

  return [...left, arr[indexToCenter], ...right];
};

export const chunkArray = <T>(arr: T[], size: number): T[][] =>
  [...Array(Math.ceil(arr.length / size))].map((_, i) => arr.slice(i * size, i * size + size));

interface CountItemsResult<T> {
  value: T;
  count: number;
}

export const countItems = <T>(arr: T[]): CountItemsResult<T>[] => {
  const map = arr.reduce((acc: CountItemsResult<T>[], cur: CountItemsResult<T>["value"]) => {
    const group = acc.find((e) => e.value === cur);
    if (!group) acc.push({ value: cur, count: 1 });
    else group.count += 1;
    return acc;
  }, []);

  return sortArray(map, "count", true, true);
};

export const getArrayDiff = <T>(a: T[], b: T[]): T[] => [
  ...a.filter((e) => !b.includes(e)),
  ...b.filter((e) => !a.includes(e)),
];

export const objectToFloat32Array = (obj: object) => new Float32Array(Object.values(obj));

export const range = (length: number) => [...Array(length).keys()];

export const rotateArrayPos = (direction: "prev" | "next", current: number, length: number) => {
  if (direction === "next") return current + 1 < length ? current + 1 : 0;
  else if (direction === "prev") return current - 1 >= 0 ? current - 1 : length - 1;
};

export const sortArray = <T>(arr: T[], key: string, isDesc = true, isNumber = false): T[] => {
  if (!arr?.length) return [];

  const sortFn = (a: T, b: T) => {
    const first = a[key] ?? (isNumber ? 0 : "");
    const second = b[key] ?? (isNumber ? 0 : "");

    const comparison = isNumber ? second - first : String(second).localeCompare(String(first));
    return isDesc ? comparison : comparison * -1;
  };

  return [...arr].sort(sortFn);
};

/** @return [falsy values, truthy values] */
export const splitArray = <T>(arr: T[], filterFn: (element: T) => boolean): T[][] =>
  arr.reduce((acc, cur) => (acc[+!filterFn(cur)].push(cur), acc), [[], []]);

export const sumArray = (arr: number[], fn: (num: number) => number) =>
  arr.reduce((acc, cur) => (acc += fn?.(cur) ?? cur), 0);

export const uniqueArrayFilter = <T>(...arrays: T[][]): T[] => {
  const all = [].concat(...arrays);
  const nonUnique = all.filter(
    (
      (set) => (value) =>
        set.has(value) || !set.add(value)
    )(new Set())
  );

  return all.filter((e) => !nonUnique.includes(e));
};

export const uniqueArrayMerge = <T>(oldArray: T[], newArrays: T[]): T[] => [
  ...new Set([...new Set(oldArray), ...[].concat(...newArrays)]),
];
