import * as types from "../actions/types";

export default function observer(state = [], action) {
    switch (action.type) {
        case types.OBSERVER_CREATED: {
            const { id } = action.payload;
            return [...state, { id, isInView: false }];
        } case types.OBSERVER_UPDATED: {
            const { id, viewState } = action.payload;
            return state.map(observer => observer.id === id ? { ...observer, isInView: viewState } : observer);
        } case types.OBSERVER_DELETED: {
            const { id } = action.payload;
            return state.filter(input => input.id !== id);
        } default: {
            return state;
        }
    }
}