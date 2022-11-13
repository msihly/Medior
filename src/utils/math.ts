export const compareLogic = (type: "AND" | "OR", ...items: any[]) =>
  type === "AND" ? items.every(Boolean) : type === "OR" ? items.some(Boolean) : null;

export const divide = (...nums: number[]) =>
  nums.length > 0 ? nums.reduce((acc, cur) => (acc /= cur)) || 0 : null;

// prettier-ignore
export const fractionStringToNumber = (str: string) => str.split("/").map((s) => +s).reduce((a, b) => a / b);

export const stringOperators = (
  operator: ">" | ">=" | "<" | "<=" | "=" | "!=",
  a: number,
  b: number
) => {
  // prettier-ignore
  switch (operator) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "=": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
};

export const getRandomInt = (min: number, max: number, cur: number = null) => {
  let num = Math.floor(Math.random() * (max - min + 1)) + min;
  return num === cur ? getRandomInt(min, max, cur) : num;
};

export const round = (num: number, decimals = 2) => {
  const n = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * n) / n;
};
