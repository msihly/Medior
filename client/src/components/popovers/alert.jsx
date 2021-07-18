import React, { Children, cloneElement } from "react";
import { useDispatch } from "react-redux";
import * as actions from "../../store/actions";
import { AlertButton, Modal } from "./";

export const AlertButton = ({ text, classes, onClick, handleClose }) => {
    const handleClick = () => {
        if (onClick) onClick();
        handleClose();
    };

    return (
        <div className={`alert-button ${classes ?? ""}`} onClick={handleClick}>
            {text}
        </div>
    );
};

const Alert = ({ children, id, modalClasses, iconClasses, icon, heading, subheading }) => {
    const dispatch = useDispatch();

    const closeAlert = () => dispatch(actions.modalClosed(id));

    return (
        <Modal id={id} classes={modalClasses ?? null}>
            <div className="alert">
                {icon && typeof icon === "string" ?
                    <img src={icon} className={`alert-icon ${iconClasses ?? ""}`} alt="" />
                    : cloneElement(icon, { className: `alert-icon ${iconClasses ?? ""}` })}
                <div className="alert-heading">{heading}</div>
                {subheading && <div className="alert-subheading">{subheading}</div>}
                <div className="row j-center">
                    <AlertButton text="Cancel" classes="grey" handleClose={closeAlert} />
                    {children && Children.map(children, child => cloneElement(child, { handleClose: closeAlert }))}
                </div>
            </div>
        </Modal>
    );
}

export default Alert;