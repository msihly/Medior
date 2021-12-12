import { types } from "store/actions";

const defaultState = [];

export const imports = (state = defaultState, action) => {
  switch (action.type) {
    case types.IMPORTS_ADDED: {
      const { imports } = action.payload;
      return [...state, ...imports];
    }
    case types.RESET:
      return defaultState;
    default:
      return state;
  }
};
