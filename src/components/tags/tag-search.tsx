import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, sortFn, tagsToDescendants, useStores } from "store";
import { Chip } from "@mui/material";
import {
  Accordion,
  Button,
  Checkbox,
  Dropdown,
  DropdownOption,
  Input,
  Modal,
  SortMenu,
  SortRow,
  Text,
  View,
} from "components";
import { Tag } from ".";
import { colors, makeClasses } from "utils";

const DEPTH_OPTIONS: DropdownOption[] = [
  { label: "\u221E", value: -1 },
  ...Array(10)
    .fill("")
    .map((_, i) => ({ label: String(i), value: i })),
];

export const TagSearch = observer(() => {
  const { homeStore, tagStore } = useStores();
  const { css } = useClasses(null);

  const [searchValue, setSearchValue] = useState<string>("");

  const [tagOptions, tagSections] = useMemo(() => {
    const searchStr = searchValue.toLowerCase();

    const tags =
      searchValue.length > 0
        ? tagStore.tags.filter((t) =>
            [t.label, ...t.aliases].some((s) => s.toLowerCase().includes(searchStr))
          )
        : null;

    const tagIds =
      tags !== null
        ? [...tags.map((t) => t.id), ...tagsToDescendants(tagStore, tags, homeStore.tagSearchDepth)]
        : null;

    const options = (
      tagIds !== null
        ? tagStore.tagOptions.filter((opt) => tagIds.includes(opt.id))
        : tagStore.tagOptions
    )
      .slice()
      .sort((a, b) =>
        sortFn({
          a,
          b,
          isSortDesc: homeStore.tagSearchSortIsDesc,
          sortKey: homeStore.tagSearchSortKey,
        })
      );

    const sections = !homeStore.tagSearchHasSections
      ? []
      : options
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
  }, [
    homeStore.tagSearchDepth,
    homeStore.tagSearchHasSections,
    homeStore.tagSearchSortIsDesc,
    homeStore.tagSearchSortKey,
    searchValue,
    tagStore.tagOptions,
  ]);

  const closeModal = () => tagStore.setIsTagManagerOpen(false);

  const handleCreate = () => {
    tagStore.setActiveTagId(null);
    tagStore.setTagManagerMode("create");
  };

  // const handleRefreshCounts = () => tagStore.refreshAllTagCounts();

  // const handleRefreshRelations = () => tagStore.refreshAllTagRelations();

  const setIsSortDesc = (isSortDesc: boolean) => homeStore.setTagSearchSortIsDesc(isSortDesc);

  const setDepth = (depth: number) => homeStore.setTagSearchDepth(depth);

  const setHasSections = (hasSections: boolean) => homeStore.setTagSearchHasSections(hasSections);

  const setSortKey = (sortKey: string) => homeStore.setTagSearchSortKey(sortKey);

  return (
    <>
      <Modal.Content>
        <View column>
          <View row justify="space-between">
            <Input label="Search" value={searchValue} setValue={setSearchValue} fullWidth />

            <Dropdown
              label="Depth"
              value={homeStore.tagSearchDepth}
              onChange={setDepth}
              options={DEPTH_OPTIONS}
              margins={{ left: "0.5rem" }}
              width="6rem"
            />

            <SortMenu
              isSortDesc={homeStore.tagSearchSortIsDesc}
              sortKey={homeStore.tagSearchSortKey}
              setIsSortDesc={setIsSortDesc}
              setSortKey={setSortKey}
              margins={{ left: "0.5rem" }}
              color={colors.grey["700"]}
              className={css.sortMenu}
            >
              <SortRow label="Count" attribute="count" icon="Numbers" />
              <SortRow label="Date Modified" attribute="dateModified" icon="DateRange" />
              <SortRow label="Date Created" attribute="dateCreated" icon="DateRange" />
              <SortRow label="Label" attribute="label" icon="Label" />
            </SortMenu>
          </View>

          <View row>
            <Checkbox
              label="A-Z Sections"
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
                  <TagSection {...{ searchValue }} tagOptions={s.tagOptions} limit={15} />
                </Accordion>
              ))
            ) : (
              <TagSection {...{ searchValue }} tagOptions={[...tagOptions]} limit={50} />
            )}
          </View>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={closeModal} color={colors.grey["700"]} />

        {/* <Button
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

        <Button text="Create" icon="Add" onClick={handleCreate} />
      </Modal.Footer>
    </>
  );
});

const TagSection = observer(
  ({
    limit,
    searchValue,
    tagOptions,
  }: {
    limit: number;
    searchValue: string;
    tagOptions: TagOption[];
  }) => {
    const { css } = useClasses(null);

    const { tagStore } = useStores();

    const [isMoreExpanded, setIsMoreExpanded] = useState(false);

    useEffect(() => {
      setIsMoreExpanded(false);
    }, [searchValue]);

    const handleTagPress = (tagId: string) => {
      tagStore.setActiveTagId(tagId);
      tagStore.setTagManagerMode("edit");
    };

    return (
      <View className={css.tags}>
        {(isMoreExpanded ? tagOptions : tagOptions.slice(0, limit)).map((t) => (
          <Tag key={t.id} id={t.id} onClick={() => handleTagPress(t.id)} className={css.tag} />
        ))}

        {tagOptions.length > limit && !isMoreExpanded && (
          <Chip
            label={`+${tagOptions.length - limit} More`}
            size="medium"
            className={css.moreTag}
            onClick={() => setIsMoreExpanded(true)}
          />
        )}
      </View>
    );
  }
);

const useClasses = makeClasses({
  moreTag: {
    backgroundColor: colors.grey["900"],
  },
  sectionHeader: {
    alignItems: "center",
  },
  sortMenu: {
    width: "3rem",
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
