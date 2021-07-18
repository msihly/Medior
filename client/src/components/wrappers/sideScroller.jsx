import React, { cloneElement, useEffect, useRef, useState } from "react";
import { debounce } from "../../utils";
import { useElementResize } from "../../utils/hooks";
import * as Media from "../../media";

const SideScroller = ({ children, hasPlaceholder }) => {
    const ref = useRef(null);
    useElementResize(ref);

    const [, setScrollPos] = useState(0);

    useEffect(() => {
        const node = ref.current;
        const scrollListener = debounce(setScrollPos.bind(node.scrollLeft), 50);

        node.addEventListener("scroll", scrollListener);
        return () => node.removeEventListener("scroll", scrollListener);
    }, []);

    const displayButton = (direction) => {
        const node = ref?.current;
        if (!node) return false;

        const { clientWidth, scrollWidth, scrollLeft } = node;
        if (!(clientWidth < scrollWidth)) return false;
        return direction === "left" ? scrollLeft > 0 : clientWidth + scrollLeft < scrollWidth;
    };

    const getButtonClasses = (direction) => {
        let className = `scroll-${direction}`;
        if (!displayButton(direction)) className += hasPlaceholder ? " invisible" : " hidden";
        return className;
    };

    const handleScroll = (direction) => {
        const node = ref?.current;
        if (!node) return false;

        node.scrollLeft += direction === "left" ? -200 : 200;
        setScrollPos(node.scrollLeft);
    };

    return (
        <div className="row">
            <div onClick={() => handleScroll("left")} className={getButtonClasses("left")}>
                <Media.IndentedArrowSVG />
            </div>
            {children && cloneElement(children, { ref, className: `${children.props.className ?? ""} side-scroller` })}
            <div onClick={() => handleScroll("right")} className={getButtonClasses("right")}>
                <Media.IndentedArrowSVG />
            </div>
        </div>
    );
};

export default SideScroller;