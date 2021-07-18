import * as types from "../actions/types";

export default function inputs(state = [], action) {
    switch (action.type) {
        case types.INPUT_CREATED: {
            const { id, value } = action.payload;
            return [...state, { id, value }];
        } case types.INPUT_UPDATED: {
            const { id, value } = action.payload;
            return state.map(input => input.id === id ? { ...input, value } : input);
        } case types.INPUT_DELETED: {
            return state.filter(input => input.id !== action.payload.id);
        } default: {
            return state;
        }
    }
}