export const divide = (...nums: number[]) =>
  nums.length > 0 ? nums.reduce((acc, cur) => (acc /= cur)) || 0 : null;

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
