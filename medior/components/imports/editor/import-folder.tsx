import path from "path";
import { useState } from "react";
import { FixedSizeList } from "react-window";
import Color from "color";
import { Card, Chip, Comp, FlatFolder, IconButton, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { formatBytes } from "medior/utils/common";
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem } from "./import-list-item";
import { TagHierarchy } from "./tag-hierarchy";

const COLL_HEIGHT = 64;
const HEADER_HEIGHT = 43;
const TAGS_HEIGHT = 46;

type Folder = Pick<FlatFolder, "collectionTitle" | "imports" | "tags">;

export interface ImportFolderListProps {
  batchId?: string;
  collapsible?: boolean;
  folder: Folder;
  maxVisibleFiles?: number;
  noStatus?: boolean;
  withListItems?: boolean;
}

export const ImportFolderList = Comp(
  ({
    batchId,
    collapsible = false,
    folder,
    maxVisibleFiles,
    noStatus = false,
    withListItems = true,
  }: ImportFolderListProps) => {
    const stores = useStores();

    const [collapsed, setCollapsed] = useState(!withListItems);

    const { css } = useClasses({ collapsible, collapsed });

    if (!folder) return null;
    const height = getImportFolderHeight({ folder, maxVisibleFiles, withListItems: !collapsed });
    const totalBytes = folder.imports.reduce((acc, cur) => acc + cur.size, 0);

    const deleteBatch = () => stores.import.manager.deleteBatch({ id: batchId });

    const toggleCollapsed = () => setCollapsed(!collapsed);

    return (
      <Card
        column
        flex="none"
        padding={{ all: 0 }}
        height={height}
        width="100%"
        bgColor={colors.background}
      >
        <View spacing="0.5rem" className={css.header}>
          <View row align="center" className={css.folderPath}>
            {collapsible ? (
              <IconButton
                name="ChevronRight"
                onClick={toggleCollapsed}
                iconProps={{ rotation: collapsed ? 90 : 270 }}
              />
            ) : null}

            <Text className={css.folderPath}>
              {folder.imports[0]?.path && path.dirname(folder.imports[0].path)}
            </Text>
          </View>

          <View row spacing="0.3rem" align="center">
            <Chip label={formatBytes(totalBytes)} className={css.chip} />

            <Chip label={`${folder.imports.length} files`} className={css.chip} />

            {batchId ? (
              <IconButton
                name="Delete"
                onClick={deleteBatch}
                iconProps={{ color: colors.custom.red }}
              />
            ) : null}
          </View>
        </View>

        {folder.collectionTitle?.length > 0 && (
          <View column className={css.collection}>
            <Text className={css.collectionTitle}>{folder.collectionTitle}</Text>
            <Text fontSize="0.7em" textAlign="center">
              {"Collection"}
            </Text>
          </View>
        )}

        {folder.tags?.length > 0 && (
          <View row className={css.tags}>
            {folder.tags.map((tag) => (
              <TagHierarchy key={tag.label} tag={tag} className={css.tag} />
            ))}
          </View>
        )}

        {!collapsed && (
          <View column className={css.list}>
            <FixedSizeList
              layout="vertical"
              width="100%"
              height={getImportFolderListHeight(folder.imports.length, maxVisibleFiles)}
              itemSize={IMPORT_LIST_ITEM_HEIGHT}
              itemCount={folder.imports.length}
            >
              {({ index, style }) => (
                <ImportListItem
                  key={index}
                  fileImport={folder.imports[index]}
                  noStatus={noStatus}
                  bgColor={
                    index % 2 === 1 ? Color(colors.foreground).fade(0.35).string() : undefined
                  }
                  style={style}
                />
              )}
            </FixedSizeList>
          </View>
        )}
      </Card>
    );
  },
);

export const getImportFolderListHeight = (count: number, maxVisibleFiles = 12) => {
  return 3 + Math.min(count * IMPORT_LIST_ITEM_HEIGHT, maxVisibleFiles * IMPORT_LIST_ITEM_HEIGHT);
};

export const getImportFolderHeight = ({
  folder,
  maxVisibleFiles,
  withListItems,
}: ImportFolderListProps) => {
  return (
    HEADER_HEIGHT +
    (folder?.collectionTitle?.length ? COLL_HEIGHT : 0) +
    (folder?.tags?.length ? TAGS_HEIGHT : 0) +
    (withListItems ? getImportFolderListHeight(folder?.imports?.length, maxVisibleFiles) : 0)
  );
};

interface ClassesProps {
  collapsible: boolean;
  collapsed: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    flexShrink: 0,
    padding: "0.2em",
    height: "auto",
    width: "auto",
    minWidth: "4em",
  },
  collection: {
    justifyContent: "center",
    borderBottom: `1px solid ${colors.custom.grey}`,
    height: COLL_HEIGHT,
    overflow: "hidden",
  },
  collectionTitle: {
    color: colors.custom.lightBlue,
    fontWeight: 500,
    textAlign: "center",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  folderPath: {
    color: colors.custom.lightGrey,
    fontSize: "0.9em",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 4,
    padding: "0.5rem",
    paddingLeft: props.collapsible ? "0" : undefined,
    height: HEADER_HEIGHT,
    backgroundColor: colors.custom.black,
  },
  list: {
    padding: "0 0 0.2rem 0",
    overflowY: "auto",
  },
  tag: {
    padding: "0.2rem 0.4rem 0.2rem 0.2rem",
  },
  tags: {
    alignItems: "center",
    padding: "0 0.3rem",
    borderBottom: !props.collapsed ? `1px solid ${colors.custom.grey}` : undefined,
    height: TAGS_HEIGHT,
    overflowX: "auto",
  },
}));
