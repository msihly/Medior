import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as actions from "../../store/actions";

const Checkbox = ({ classes, handleClick, id, initValue = false, inputName, option, text}) => {
    const dispatch = useDispatch();

    const isChecked = useSelector(state => state.inputs.find(input => input.id === id)?.value ?? initValue);

    useEffect(() => {
        dispatch(actions.inputCreated(id, initValue));

        return () => dispatch(actions.inputDeleted(id));
    }, [dispatch, id, initValue]);

    const toggleCheckbox = event => {
        event.preventDefault();
        event.stopPropagation();

        dispatch(actions.inputUpdated(id, !isChecked));

        handleClick && handleClick(option ?? !isChecked);
    };

    return (
        <label onClick={toggleCheckbox} className={`checkbox-ctn${isChecked ? " checked" : ""}${classes ? " " + classes : ""}`}>
            <input type="checkbox" name={inputName ?? null} checked={isChecked} readOnly />
            <span className="checkbox"></span>
            {text && <label className="lb-title checkbox-title">{text}</label>}
        </label>
    );
};

export default Checkbox;