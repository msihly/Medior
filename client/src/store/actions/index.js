import * as types from "./types";

/******************** MODALS ********************/
export const modalClosed = (id) => ({
    type: types.MODAL_CLOSED,
    payload: { id }
});

export const modalOpened = (id) => ({
    type: types.MODAL_OPENED,
    payload: { id }
});

/******************** INPUTS ********************/
export const inputCreated = (id, value) => ({
    type: types.INPUT_CREATED,
    payload: { id, value }
});

export const inputDeleted = (id) => ({
    type: types.INPUT_DELETED,
    payload: { id }
});

export const inputUpdated = (id, value) => ({
    type: types.INPUT_UPDATED,
    payload: { id, value }
});

/******************** OBSERVERS ********************/
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