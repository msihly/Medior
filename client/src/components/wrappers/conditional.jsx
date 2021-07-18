import React, { Fragment } from "react";

const ConditionalWrap = ({ condition, wrap, children }) => condition ? wrap(children) : <Fragment>{children}</Fragment>;

export default ConditionalWrap;