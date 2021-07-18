import React, { cloneElement, isValidElement, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as actions from "../../store/actions";

const DropSelect = ({ children, handleSelect, id, initValue, parent }) => {
    const dispatch = useDispatch();

    const isOpen = useSelector(state => state.menus.find(menu => menu.id === id)?.isOpen || false);

    const [value, setValue] = useState(initValue);

    const selectOption = event => {
        event.stopPropagation();
        setValue(event.target.innerHTML);
        handleSelect(event.target.innerHTML);
        dispatch(actions.menuClosed(id, parent));
    };

    const toggleMenu = event => {
		event.stopPropagation();
		dispatch(isOpen ? actions.menuClosed(id, parent) : actions.menuOpened(id, parent));
    };

    return (
        <span onClick={toggleMenu} className="relative">
            <div className={`drop-menu-content${isOpen ? "" : " hidden"}`}>
                {children.map((child, key) => {
                    return !isValidElement(child) ? child : cloneElement(child, {
                        key,
                        title: child.props.children,
                        className: `drop-btn ${child.props.className}`,
                        onClick: selectOption
                    });
                })}
            </div>
            <span className="dropdown down-arrow">{value}</span>
        </span>
    );
};

export default DropSelect;