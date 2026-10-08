import { shell } from "@electron/remote";
import path from "path";
import { useEffect, useState } from "react";
import { FixedSizeList } from "react-window";
import Color from "color";
import {
  Card,
  Chip,
  Comp,
  FlatFolder,
  IconButton,
  Pagination,
  TagRow,
  Text,
  View,
} from "medior/components";
import { FileImportBatch, useStores } from "medior/store";
import { colors, CssColor, makeBorderRadiuses, makeClasses, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem } from "./import-list-item";
import { IMPORT_CHIP_STYLE } from "./tooltip-chip";

const COLL_HEIGHT = 42;
const HEADER_HEIGHT = 43;
const TAGS_HEIGHT = 56;

type Folder = Pick<FlatFolder, "collectionTitle" | "imports" | "savedConfigLabel" | "tags">;

export interface ImportFolderListProps {
  collapsible?: boolean;
  folder: Folder;
  maxVisibleFiles?: number;
  noStatus?: boolean;
  withListItems?: boolean;
}

export const ImportFolderList = Comp(
  ({
    collapsible = false,
    folder,
    maxVisibleFiles,
    noStatus = false,
    withListItems = true,
  }: ImportFolderListProps) => {
    const stores = useStores();

    const [collapsed, setCollapsed] = useState(!withListItems);

    const batch = folder instanceof FileImportBatch ? folder : null;
    const folderPath =
      batch?.sourceFolderPath ??
      batch?.rootFolderPath ??
      (folder?.imports[0]?.path && path.dirname(folder.imports[0].path));

    const hasCollection = folder?.collectionTitle?.length > 0;
    const hasTags = folder?.tags?.length > 0;
    const height = folder
      ? getImportFolderHeight({ folder, maxVisibleFiles, withListItems: !collapsed })
      : null;

    const totalBytes = batch
      ? batch.size
      : folder
        ? folder.imports.reduce((acc, cur) => acc + cur.size, 0)
        : null;

    const { css, cx } = useClasses({ collapsed, collapsible, hasCollection, hasTags });

    const deleteBatch = () => stores.import.manager.deleteBatch({ id: batch.id });

    const handlePageChange = (page: number) => batch.loadPage(page);

    const openFolder = async () => {
      if (!folderPath) return;

      const error = await shell.openPath(folderPath);

      if (error) toast.error(error);
    };

    const toggleCollapsed = () => setCollapsed(!collapsed);

    useEffect(() => {
      if (batch && !collapsed) batch.loadPage();
    }, [batch, collapsed]);

    return !folder ? null : (
      <Card
        column
        flex="none"
        overflow="hidden"
        padding={{ all: 0 }}
        height={batch ? undefined : height}
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
                padding={{ all: "0.3em" }}
              />
            ) : null}

            <IconButton
              name="FolderOpen"
              tooltip="Open Folder"
              onClick={openFolder}
              padding={{ all: "0.3em" }}
              iconProps={{ size: "0.9em" }}
            />

            <Text onClick={openFolder} className={css.folderPath}>
              {folderPath}
            </Text>
          </View>

          <View row spacing="0.3rem" align="center">
            {folder.savedConfigLabel ? (
              <Chip
                label={`Config: ${folder.savedConfigLabel}`}
                className={cx(css.chip, css.configChip)}
              />
            ) : null}

            <Chip label={Fmt.bytes(totalBytes)} className={css.chip} />

            <Chip
              label={`${Fmt.commas(batch?.fileCount ?? folder.imports.length)} files`}
              className={css.chip}
            />

            {batch && !batch.isReady && <Chip label="Upload incomplete" className={css.chip} />}

            {batch ? (
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
          </View>
        )}

        {hasTags && (
          <TagRow tags={folder.tags} virtualized={folder.tags.length > 30} className={css.tags} />
        )}

        {!collapsed && (
          <View column className={css.list}>
            {batch?.loadError && <Text color={colors.custom.red}>{batch.loadError}</Text>}

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
                  batchImports={folder.imports}
                  fileImport={folder.imports[index]}
                  noStatus={noStatus}
                  bgColor={
                    index % 2 === 1
                      ? (Color(colors.foreground).fade(0.35).string() as CssColor)
                      : undefined
                  }
                  style={style}
                />
              )}
            </FixedSizeList>

            {batch && (
              <Pagination
                inline
                count={batch.pageCount}
                page={batch.page}
                isLoading={batch.isLoadingEntries}
                onChange={handlePageChange}
                siblingCount={1}
              />
            )}
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

interface ClassesProps extends Pick<ImportFolderListProps, "collapsible"> {
  collapsed: boolean;
  hasCollection: boolean;
  hasTags: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: IMPORT_CHIP_STYLE,
  collection: {
    borderBottom: props.collapsed && !props.hasTags ? undefined : `1px solid ${colors.custom.grey}`,
    flexShrink: 0,
    height: COLL_HEIGHT,
    justifyContent: "center",
    overflow: "hidden",
  },
  collectionTitle: {
    color: colors.custom.lightBlue,
    fontWeight: 500,
    overflow: "hidden",
    padding: "0 0.5rem",
    textAlign: "center",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  configChip: {
    color: colors.custom.lightBlue,
    fontWeight: 600,
    maxWidth: "12rem",
  },
  folderPath: {
    color: colors.custom.lightGrey,
    cursor: "pointer",
    fontSize: "0.9em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    justifyContent: "space-between",
    alignItems: "center",
    ...makeBorderRadiuses({
      bottom: props.collapsed && !props.hasCollection && !props.hasTags ? "0.5rem" : 0,
      top: "0.5rem",
    }),
    padding: "0.5rem",
    paddingLeft: props.collapsible ? "0" : undefined,
    height: HEADER_HEIGHT,
    backgroundColor: colors.custom.black,
  },
  list: {
    minHeight: 0,
    overflow: "hidden",
  },
  tags: {
    alignItems: "center",
    borderBottom: !props.collapsed ? `1px solid ${colors.custom.grey}` : undefined,
    boxSizing: "border-box",
    flexShrink: 0,
    height: TAGS_HEIGHT,
    overflowX: "auto",
    padding: "0 0.3rem 0 0.5rem",
  },
}));
