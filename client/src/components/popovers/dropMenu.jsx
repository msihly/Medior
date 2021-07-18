import React, { isValidElement, cloneElement } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ConditionalWrap } from "../wrappers";
import * as actions from "../../store/actions";

const DropMenu = ({ children, contentClasses, id, isWrapped, retainOnClick, toggleClasses }) => {
    const dispatch = useDispatch();

    const isOpen = useSelector(state => state.menus.find(menu => menu.id === id)?.isOpen ?? false);

    const toggleMenu = event => {
		event.stopPropagation();
		dispatch(isOpen ? actions.menuClosed(id) : actions.menuOpened(id));
    };

    return (
        <ConditionalWrap condition={isWrapped} wrap={children => <div className="menu">{children}</div>}>
            <div className={`${contentClasses ?? "menu-content"}${isOpen ? "" : " hidden"}`}>
                {children.map((child, key) => {
                    return !isValidElement(child) ? child : cloneElement(child, {
                        key,
                        onClick: event => {
                            event.stopPropagation();
                            if (!retainOnClick) dispatch(actions.menuClosed(id));
                            if (child.props?.onClick) child.props.onClick();
                        }
                    });
                })}
            </div>
            <div onClick={toggleMenu} className={toggleClasses ?? "menu-toggle"}></div>
        </ConditionalWrap>
    );
};

export default DropMenu;