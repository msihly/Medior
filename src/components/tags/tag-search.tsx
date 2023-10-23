import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, tagsToDescendants, useStores } from "store";
import { DialogContent, DialogActions, colors, Chip } from "@mui/material";
import {
  Accordion,
  Button,
  Checkbox,
  Dropdown,
  DropdownOption,
  Input,
  Text,
  View,
} from "components";
import { Tag } from ".";
import { makeClasses } from "utils";

const DEPTH_OPTIONS: DropdownOption[] = [
  { label: "\u221E", value: -1 },
  ...Array(10)
    .fill("")
    .map((_, i) => ({ label: String(i), value: i })),
];

export const TagSearch = observer(() => {
  const { homeStore, tagStore } = useStores();
  const { css } = useClasses(null);

  const [isMoreExpanded, setIsMoreExpanded] = useState(false);
  const [searchValue, setSearchValue] = useState<string>("");

  useEffect(() => {
    setIsMoreExpanded(false);
  }, [searchValue]);

  const [tagOptions, tagSections] = useMemo(() => {
    const searchStr = searchValue.toLowerCase();

    const tags =
      searchValue.length > 0
        ? tagStore.tags.filter((t) => t.label.toLowerCase().includes(searchStr))
        : null;

    const tagIds =
      tags !== null
        ? [...tags.map((t) => t.id), ...tagsToDescendants(tagStore, tags, homeStore.tagSearchDepth)]
        : null;

    const options =
      tagIds !== null
        ? tagStore.tagOptions.filter((opt) => tagIds.includes(opt.id))
        : tagStore.tagOptions;

    const sections = options
      .reduce((acc, cur) => {
        const firstChar = cur.label.charAt(0).toUpperCase();
        const section = acc.find((a) => a.firstChar === firstChar);
        if (!section) acc.push({ firstChar, tagOptions: [cur] });
        else section.tagOptions.push(cur);
        return acc;
      }, [] as { firstChar: string; tagOptions: TagOption[] }[])
      .sort((a, b) => a.firstChar.localeCompare(b.firstChar))
      .map((s) => ({
        firstChar: s.firstChar,
        header: (
          <View row className={css.sectionHeader}>
            <Text>{s.firstChar}</Text>
            <Text color={colors.grey["400"]} margin="0 0.5rem">
              {"-"}
            </Text>
            <Text color={colors.grey["400"]} fontSize="0.9em">
              {s.tagOptions.length}
            </Text>
          </View>
        ),
        tagOptions: s.tagOptions,
      }));

    return [options, sections];
  }, [homeStore.tagSearchDepth, searchValue, tagStore.tagOptions]);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleCreate = () => {
    tagStore.setActiveTagId(null);
    tagStore.setTagManagerMode("create");
  };

  const handleDirToTag = () => tagStore.setTagManagerMode("dirToTag");

  // const handleRefreshCounts = () => tagStore.refreshAllTagCounts();

  // const handleRefreshRelations = () => tagStore.refreshAllTagRelations();

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
  };

  const setDepth = (depth: number) => homeStore.setTagSearchDepth(depth);

  const setHasSections = (hasSections: boolean) => homeStore.setTagSearchHasSections(hasSections);

  return (
    <>
      <DialogContent dividers className={css.dialogContent}>
        <View column>
          <View row>
            <Input
              label="Search"
              value={searchValue}
              setValue={setSearchValue}
              className={css.input}
            />

            <Dropdown
              label="Depth"
              value={homeStore.tagSearchDepth}
              onChange={setDepth}
              options={DEPTH_OPTIONS}
              margins={{ left: "0.5rem" }}
              width="6rem"
            />

            <Checkbox
              label="AZ"
              checked={homeStore.tagSearchHasSections}
              setChecked={setHasSections}
              center
            />
          </View>

          <View className={css.tagContainer}>
            {homeStore.tagSearchHasSections ? (
              tagSections.map((s) => (
                <Accordion
                  key={s.firstChar}
                  header={s.header}
                  color={colors.grey["900"]}
                  dense
                  expanded
                >
                  <View className={css.tags}>
                    {s.tagOptions.map((t) => (
                      <Tag
                        key={t.id}
                        id={t.id}
                        onClick={() => handleTagPress(t.id)}
                        className={css.tag}
                      />
                    ))}

                    {s.tagOptions.length > 50 && (
                      <Chip
                        label={`+${s.tagOptions.length - 50} More`}
                        size="medium"
                        className={css.moreTag}
                      />
                    )}
                  </View>
                </Accordion>
              ))
            ) : (
              <View className={css.tags}>
                {(isMoreExpanded ? tagOptions : tagOptions.slice(0, 100)).map((t) => (
                  <Tag
                    key={t.id}
                    id={t.id}
                    onClick={() => handleTagPress(t.id)}
                    className={css.tag}
                  />
                ))}

                {tagOptions.length > 100 && !isMoreExpanded && (
                  <Chip
                    label={`+${tagOptions.length - 100} More`}
                    size="medium"
                    className={css.moreTag}
                    onClick={() => setIsMoreExpanded(true)}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      </DialogContent>

      <DialogActions className={css.dialogActions}>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.grey["700"]} />
        {/*
        <Button
          text="Refresh Counts"
          icon="Refresh"
          onClick={handleRefreshCounts}
          color={colors.blueGrey["700"]}
        />

        <Button
          text="Refresh Relations"
          icon="Refresh"
          onClick={handleRefreshRelations}
          color={colors.blueGrey["700"]}
        /> */}

        <Button text="Folders to Tags" icon="Folder" onClick={handleDirToTag} />

        <Button text="Create" icon="Add" onClick={handleCreate} />
      </DialogActions>
    </>
  );
});

const useClasses = makeClasses({
  dialogActions: {
    justifyContent: "center",
  },
  dialogContent: {
    padding: "0.5rem 1rem",
  },
  input: {
    marginBottom: "0.5rem",
    minWidth: "15rem",
  },
  inputTitle: {
    marginTop: "0.3rem",
    textShadow: `0 0 10px ${colors.blue["600"]}`,
    fontSize: "0.8em",
  },
  moreTag: {
    backgroundColor: colors.grey["900"],
  },
  sectionHeader: {
    alignItems: "center",
  },
  tag: {
    marginBottom: "0.3em",
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    padding: "0.5rem",
  },
  tagContainer: {
    borderRadius: "0.3rem",
    height: "20rem",
    width: "100%",
    backgroundColor: colors.grey["800"],
    overflow: "auto",
  },
});
