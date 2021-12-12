import { types } from "store/actions";

/* ---------------------------- PLAIN ACTIONS ---------------------------- */
export const importsAdded = (imports) => ({
  type: types.IMPORTS_ADDED,
  payload: { imports },
});
