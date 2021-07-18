import React from "react";

const Form = ({ children, classes, onSubmit, submitText, submitClasses }) => {
    const handleSubmit = event => {
        event.preventDefault();
        onSubmit(new FormData(event.target));
    };

    return (
        <form className={classes ?? null} onSubmit={handleSubmit} encType="multipart/form-data">
            {children}
            <button type="submit" className={submitClasses ?? null}>{submitText}</button>
        </form>
    );
};

export default Form;