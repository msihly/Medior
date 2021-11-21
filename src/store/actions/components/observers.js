import { types } from "store/actions";

export const observerCreated = (id) => ({
    type: types.OBSERVER_CREATED,
    payload: { id }
});

export const observerDeleted = (id) => ({
    type: types.OBSERVER_DELETED,
    payload: { id }
});

export const observerUpdated = (id, viewState) => ({
    type: types.OBSERVER_UPDATED,
    payload: { id, viewState }
});