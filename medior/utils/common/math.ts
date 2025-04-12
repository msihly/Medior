export const LOGICAL_OPS = ["=", "!=", ">", ">=", "<", "<="] as const;
export type LogicalOp = (typeof LOGICAL_OPS)[number];

export const compareLogicOps = (operator: LogicalOp, a: number, b: number) => {
  // prettier-ignore
  switch (operator) {
    case "=": return a === b;
    case "!=": return a !== b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    default: return false;
  }
};

export const compareLogic = (type: "AND" | "OR", ...items: any[]) =>
  type === "AND" ? items.every(Boolean) : type === "OR" ? items.some(Boolean) : null;

// prettier-ignore
export const fractionStringToNumber = (str: string) => str.split("/").map((s) => +s).reduce((a, b) => a / b);

export const logicOpsToMongo = (op: LogicalOp | "") => {
  // prettier-ignore
  switch (op) {
    case "=": return "$eq";
    case "!=": return "$ne";
    case ">": return "$gt";
    case ">=": return "$gte";
    case "<": return "$lt";
    case "<=": return "$lte";
    default: return null;
  }
};


export const round = (num: number, decimals = 2) => {
  const n = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * n) / n;
};
