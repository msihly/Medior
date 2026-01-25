import path from "path";
import { useState } from "react";
import { FixedSizeList } from "react-window";
import Color from "color";
import { Card, Chip, Comp, FlatFolder, IconButton, TagRow, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeBorderRadiuses, makeClasses } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem } from "./import-list-item";

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

    const hasCollection = folder?.collectionTitle?.length > 0;
    const hasTags = folder?.tags?.length > 0;
    const height = folder
      ? getImportFolderHeight({ folder, maxVisibleFiles, withListItems: !collapsed })
      : null;
    const totalBytes = folder ? folder.imports.reduce((acc, cur) => acc + cur.size, 0) : null;

    const { css } = useClasses({ collapsible, collapsed, hasCollection, hasTags });

    const deleteBatch = () => stores.import.manager.deleteBatch({ id: batchId });

    const toggleCollapsed = () => setCollapsed(!collapsed);

    return !folder ? null : (
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
            <Chip label={Fmt.bytes(totalBytes)} className={css.chip} />

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

        {hasCollection && (
          <View column className={css.collection}>
            <Text className={css.collectionTitle}>{folder.collectionTitle}</Text>
            <Text fontSize="0.7em" textAlign="center">
              {"Collection"}
            </Text>
          </View>
        )}

        {hasTags && <TagRow tags={folder.tags} className={css.tags} />}

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
  hasCollection: boolean;
  hasTags: boolean;
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
    borderBottom: props.collapsed && !props.hasTags ? undefined : `1px solid ${colors.custom.grey}`,
    height: COLL_HEIGHT,
    overflow: "hidden",
  },
  collectionTitle: {
    padding: "0 0.5rem",
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
    ...makeBorderRadiuses({
      top: "0.5rem",
      bottom: props.collapsed && !props.hasCollection && !props.hasTags ? "0.5rem" : 0,
    }),
    padding: "0.5rem",
    paddingLeft: props.collapsible ? "0" : undefined,
    height: HEADER_HEIGHT,
    backgroundColor: colors.custom.black,
  },
  list: {
    padding: "0 0 0.2rem 0",
    overflowY: "auto",
  },
  tags: {
    alignItems: "center",
    padding: "0 0.3rem 0 0.5rem",
    borderBottom: !props.collapsed ? `1px solid ${colors.custom.grey}` : undefined,
    height: TAGS_HEIGHT,
    overflowX: "auto",
  },
}));
