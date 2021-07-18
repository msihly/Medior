import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as actions from "../../store/actions";
import * as Media from "../../media";

const ImageInput = ({ id, initValue, inputName }) => {
    const inputRef = useRef(null);

    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(actions.imageInputCreated(id, initValue));

        return () => dispatch(actions.inputDeleted(id));
    }, [dispatch, id, initValue]);

    const [imageName, setImageName] = useState(initValue ? initValue.substring(initValue.lastIndexOf("/") + 1) : "");
    const [hasImage, setHasImage] = useState(initValue !== Media.NoImage);

    const isImageRemoved = useSelector(state => state.inputs.find(input => input.id === id)?.isImageRemoved ?? false);

    const handleFileChange = event => {
        const fileInput = event.target;
        const isFileAdded = fileInput.files.length > 0;

        setImageName(fileInput.value.split("\\").pop());
        setHasImage(isFileAdded);

        if (isFileAdded) {
            const reader = new FileReader();
            reader.onload = e => dispatch(actions.imageInputUpdated(id, e.target.result, false));
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            dispatch(actions.imageInputUpdated(id, null, false));
        }
    };

    const handleImageRemoval = event => {
        if (hasImage) {
            event.preventDefault();
            dispatch(actions.imageInputUpdated(id, null, true));
            inputRef.current.value = "";
            setImageName("");
            setHasImage(false);
        }
    };

    return (
        <div className="row mgn-btm">
            <label className={`file-input-group${hasImage ? " del" : ""}`} onClick={handleImageRemoval}>
                <span className={`file-input-name${hasImage ? "" : " hidden"}`} title={imageName}>{imageName}</span>
                <span className="file-input-btn" />
                <input ref={inputRef} name={inputName} className="file-input" onChange={handleFileChange} type="file" accept="image/png, image/jpeg" />
            </label>
            <input name="isImageRemoved" value={isImageRemoved} type="hidden" />
        </div>
    );
}

export default ImageInput;