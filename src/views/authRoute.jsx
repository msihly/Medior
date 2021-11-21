import React from "react";
import { Route, Redirect } from "react-router-dom";
import Auth from "utils/auth";

const AuthRoute = ({ component: Component, ...rest }) => (
    <Route {...rest} render={props => Auth.getStatus() ? <Component {...props} /> : <Redirect from={props.location.pathname} to="/login" />} />
);

export default AuthRoute;