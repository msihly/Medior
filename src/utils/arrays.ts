export const arrayIntersect = (...arrays: any[][]) =>
  [...arrays].reduce((acc, cur) => acc.filter((e) => cur.includes(e)));

interface CountItemsResult {
  value: any;
  count: number;
}

export const countItems = (arr: any[]): CountItemsResult[] => {
  const map = arr.reduce((acc: CountItemsResult[], cur: CountItemsResult["value"]) => {
    const group = acc.find((e) => e.value === cur);
    if (!group) acc.push({ value: cur, count: 1 });
    else group.count += 1;
    return acc;
  }, []);

  return sortArray(map, "count", true, true);
};

export const getArrayDiff = (a: any[], b: any[]) =>
  a.filter((e) => !b.includes(e)).concat(b.filter((e) => !a.includes(e)));

export const rotateArrayPos = (direction: "prev" | "next", current: number, length: number) => {
  if (direction === "next") return current + 1 < length ? current + 1 : 0;
  else if (direction === "prev") return current - 1 >= 0 ? current - 1 : length - 1;
};

export const sortArray = (arr: any[], key: string, isDesc = true, isNumber = false) => {
  if (arr === undefined) {
    console.debug("Array reference is undefined in sortArray(...)");
    return [];
  }
  if (!arr?.length) return [];

  const sorted = [...arr];

  sorted.sort((a, b) => {
    const first = a[key] ?? (isNumber ? 0 : "");
    const second = b[key] ?? (isNumber ? 0 : "");

    const comparison = isNumber ? second - first : String(second).localeCompare(String(first));
    return isDesc ? comparison : comparison * -1;
  });

  return sorted;
};

export const splitArray = (arr: any[], filterFn: (element: any) => boolean): any[][] =>
  arr.reduce((acc, cur) => (acc[+!filterFn(cur)].push(cur), acc), [[], []]);

export const sumArray = (arr: number[], fn: (num: number) => number) =>
  arr.reduce((acc, cur) => (acc += fn?.(cur) ?? cur), 0);

export const uniqueArrayFilter = (...arrays: any[][]) => {
  const all = [].concat(...arrays);
  const nonUnique = all.filter(
    (
      (set) => (value) =>
        set.has(value) || !set.add(value)
    )(new Set())
  );
  return all.filter((e) => !nonUnique.includes(e));
};

export const uniqueArrayMerge = (oldArray: any[], newArrays: any[]) => [
  ...new Set([...new Set(oldArray), ...[].concat(...newArrays)]),
];
