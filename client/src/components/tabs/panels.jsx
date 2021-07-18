import React, { Fragment, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as actions from "../../store/actions";

export const Panel = ({ children, ...props }) => <div {...props}>{children}</div>;

export const PanelContainer = ({ children, id, initValue = 0 }) => {
    const dispatch = useDispatch();

    const activePanel = useSelector(state => state.panels.find(panel => panel.id === id)?.value);

    useEffect(() => {
        dispatch(actions.panelCreated(id, initValue));

        return () => dispatch(actions.panelDeleted(id));
    }, [dispatch, id, initValue]);

    return (
        <Fragment>
            {children && children[activePanel]}
        </Fragment>
    );
};

export const PanelSwitch = ({ children, classes, panelIndex, parent }) => {
    const dispatch = useDispatch();

    return (
        <span className={classes ?? "text-btn"} onClick={() => dispatch(actions.panelUpdated(parent, panelIndex))}>
            {children}
        </span>
    );
};