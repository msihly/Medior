import React, { useContext, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actions } from "store";
import Selecto from "react-selecto";
import { Pagination, colors, Typography } from "@mui/material";
import { AppContext } from "app";
import { ImageDetails, ImageGrid } from "./";
import { makeStyles, sortArray } from "utils";

const NUMERICAL_ATTRIBUTES = ["size"];
const ROW_COUNT = 20;

const ImageContainer = ({ mode }) => {
  const { classes: css } = useClasses();
  const selectRef = useRef();
  const dispatch = useDispatch();

  const images = useSelector((state) => state.images);

  const handleSelect = (e) => {
    const added = e.added.map((img) => ({ fileId: +img.id, isSelected: true }));
    const removed = e.removed.map((img) => ({ fileId: +img.id, isSelected: false }));
    dispatch(actions.imagesUpdated(added.concat(removed)));
  };

  const handleScroll = (e) => {
    selectRef.current.scrollBy(e.direction[0] * 10, e.direction[1] * 10);
  };

  const {
    isArchiveOpen,
    includeValue,
    excludeValue,
    selectedImageTypes,
    selectedVideoTypes,
    sortKey,
    sortDir,
  } = useContext(AppContext);
  const sorted = useMemo(() => {
    const includedTags = includeValue.map((t) => t.label);
    const excludedTags = excludeValue.map((t) => t.label);

    const unarchived = images.filter((img) => isArchiveOpen === Boolean(img.archived));
    const filtered = unarchived.filter((img) => {
      const hasIncluded = includedTags.every((t) => img.tags.includes(t));
      const hasExcluded = excludedTags.some((t) => img.tags.includes(t));
      const hasExt = !!Object.entries({ ...selectedImageTypes, ...selectedVideoTypes }).find(
        ([key, value]) => key === img.ext.substring(1) && value
      );
      return hasIncluded && !hasExcluded && hasExt;
    });

    return sortArray(filtered, sortKey, sortDir === "desc", NUMERICAL_ATTRIBUTES.includes(sortKey));
  }, [
    images,
    isArchiveOpen,
    includeValue,
    excludeValue,
    selectedImageTypes,
    selectedVideoTypes,
    sortKey,
    sortDir,
  ]);

  const [page, setPage] = useState(1);
  const displayed = useMemo(() => {
    return sorted.slice((page - 1) * ROW_COUNT, page * ROW_COUNT);
  }, [page, sorted]);

  return (
    <div className={css.container}>
      <Selecto
        dragContainer={selectRef.current}
        onSelect={handleSelect}
        selectableTargets={[".selectable"]}
        continueSelect={true}
        hitRate={0}
        scrollOptions={{ container: selectRef.current, throttleTime: 15 }}
        onScroll={handleScroll}
      />

      <div ref={selectRef} className={css.images}>
        {displayed?.length > 0 ? (
          displayed.map((image) =>
            mode === "details" ? (
              <ImageDetails key={image.fileId} {...{ image }} />
            ) : (
              <ImageGrid key={image.fileId} {...{ image }} />
            )
          )
        ) : (
          <div className={css.noResults}>
            <Typography variant="h5">No results found</Typography>
          </div>
        )}
      </div>

      <Pagination
        count={sorted.length < ROW_COUNT ? 1 : Math.ceil(sorted.length / ROW_COUNT)}
        page={page}
        onChange={(_, value) => setPage(value)}
        showFirstButton
        showLastButton
        className={css.pagination}
      />
    </div>
  );
};

export default ImageContainer;

const useClasses = makeStyles()({
  container: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
  },
  images: {
    display: "flex",
    flexFlow: "row wrap",
    overflowY: "auto",
  },
  noResults: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRadius: "2rem",
    margin: "0 auto",
    padding: "0.3rem",
    width: "fit-content",
    backgroundColor: colors.grey["900"],
  },
});
