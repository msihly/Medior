import React from "react";
import { useDispatch } from "react-redux";
import * as actions from "../../store/actions";
import { Portal } from "../popovers";

const Banner = ({ children, classes, handleClose, id }) => {
    const dispatch = useDispatch();

    const close = () => {
        if (handleClose) handleClose();
        dispatch(actions.modalClosed(id));
    };

    return (
        <Portal>
            <div className={`banner ${classes ?? ""}`}>
                <span className="close" onClick={close}>&times;</span>
                {children}
            </div>
        </Portal>
    );
};

export default Banner;