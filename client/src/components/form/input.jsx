import React, { Fragment, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as actions from "../../store/actions";
import { validate } from "../../utils";

const ConditionalWrap = ({ condition, wrap, children }) => condition ? wrap(children) : <Fragment>{children}</Fragment>;

const Input = ({ classes, autoComplete, groupClasses, hasErrorCheck, id, isDisabled, initValue, isRequired, isRow, isTransparent, label, name, placeholder, title, type }) => {
    const dispatch = useDispatch();

    const [hasError, setHasError] = useState(false);
    const [errorDesc, setErrorDesc] = useState("Valid");

    const value = useSelector(state => state.inputs.find(input => input.id === id)?.value ?? null);

    const checkValidity = value => {
        if (isRequired && !value) return "Field is required";

        switch (name) {
            case "title":
                return value.length > 255 ? "Title cannot be more than 255 characters" : "Valid";
            case "pageUrl":
                return value.length > 2083 ? "Page URL cannot be more than 2083 characters" : !validate("url", value) ? "Invalid URL" : "Valid";
            default:
                return "Valid";
        }
    };

    const checkError = value => {
        const desc = checkValidity(value);
        setHasError(desc !== "Valid");
        setErrorDesc(desc);
    };

    const handleInput = event => {
        const { target, target: { value } } = event;
        const cursorPos = target.selectionStart;

        window.requestAnimationFrame(() => {
            target.selectionStart = cursorPos;
            target.selectionEnd = cursorPos;
        });

        dispatch(actions.inputUpdated(id, value));
        hasErrorCheck && checkError(value);
    };

    const getGroupClasses = () => {
        let className = "form-group";
        if (groupClasses) className += " " + groupClasses;
        if (!hasErrorCheck) className += " no-error";
        if (isRow) className += " full-width";
        if (isTransparent) className += " rev";
        return className;
    };

    useEffect(() => {
        dispatch(actions.inputCreated(id, initValue ?? ""));

        return () => dispatch(actions.inputDeleted(id));
    }, [dispatch, id, initValue]);

    return (
        <ConditionalWrap condition={isRow} wrap={children => <div className="row">{children}</div>}>
            {isRow && <label className="lb-title horizontal" title={title ?? null}>{label}</label>}
            <div className={getGroupClasses()}>
                {!isRow && (isTransparent
                    ? hasErrorCheck && <label className={`error-label${hasError ? "" : " invisible"}`}>{errorDesc}</label>
                    : label && <label title={title ?? null}>{label}</label>)}
                <input autoComplete={autoComplete ?? "off"} className={`${classes ?? ""}${isTransparent ? " t-input" : ""}`}
                    disabled={isDisabled ?? null} name={name ?? null} onChange={handleInput} placeholder={placeholder ?? null}
                    required={isRequired ?? null} type={type} value={value ?? ""} />
                {hasErrorCheck && (isTransparent
                    ? label && <label className={isTransparent ? "lb-title" : null} title={title ?? null}>{label}</label>
                    : <label className={`error-label${hasError ? "" : " invisible"}`}>{errorDesc}</label>)}
            </div>
        </ConditionalWrap>
    );
};

export default Input;