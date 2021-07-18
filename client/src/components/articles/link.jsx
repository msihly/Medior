import React from "react";

const Link = ({ children, isNewTab, url, ...props }) => (
    <a href={url} title={url} target={isNewTab ? "_blank" : "_self"} rel="noreferrer noopener" {...props}>{children}</a>
);

export default Link;