import { shell } from "@electron/remote";
import path from "path";
import { useEffect, useRef, useState } from "react";
import { List, ListImperativeAPI, RowComponentProps } from "react-window";
import Color from "color";
import type { ImportStatus } from "medior/server/database";
import {
  Card,
  Chip,
  Comp,
  FlatFolder,
  IconButton,
  IMPORT_STATUSES,
  Pagination,
  TagRow,
  Text,
  TooltipWrapper,
  View,
} from "medior/components";
import { FileImportBatch, useStores } from "medior/store";
import { colors, CssColor, makeBorderRadiuses, makeClasses, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { getIsLinkedPath } from "medior/utils/server";
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem } from "./import-list-item";
import { IMPORT_CHIP_STYLE } from "./tooltip-chip";

const COLL_HEIGHT = 42;
const HEADER_HEIGHT = 43;
const MAX_VISIBLE_FILES = 12;
const TAGS_HEIGHT = 56;

type Folder = Pick<FlatFolder, "collectionTitle" | "imports" | "savedConfigLabel" | "tags">;

export interface ImportFolderListProps {
  collapsible?: boolean;
  /** Replaces the folder's title, such as a season titled after its renamed program. */
  collectionTitle?: string;
  /** Fills its container, scrolling its files within it, instead of sizing to its files. */
  fill?: boolean;
  folder: Folder;
  noStatus?: boolean;
  /** Clicking the header selects the batch in the Import Manager's search. */
  selectable?: boolean;
  withListItems?: boolean;
}

export const ImportFolderList = Comp(
  ({
    collapsible = false,
    collectionTitle,
    fill = false,
    folder,
    noStatus = false,
    selectable = false,
    withListItems = true,
  }: ImportFolderListProps) => {
    const stores = useStores();

    const [collapsed, setCollapsed] = useState(!withListItems);

    const listRef = useRef<ListImperativeAPI>(null);

    const batch = folder instanceof FileImportBatch ? folder : null;
    const folderPath =
      batch?.sourceFolderPath ??
      batch?.rootFolderPath ??
      (folder?.imports[0]?.path && path.dirname(folder.imports[0].path));

    const isLinked = !!folderPath && getIsLinkedPath(folderPath);
    // Program seasons are added to their program without a collection.
    const title = collectionTitle ?? folder?.collectionTitle ?? batch?.mediaProgram?.title;
    const hasCollection = title?.length > 0;
    const hasTags = folder?.tags?.length > 0;
    const subtitleCount = folder?.imports.reduce(
      (count, imp) => count + (imp.subtitles?.length ?? 0),
      0,
    );
    const height = folder ? getImportFolderHeight({ folder, withListItems: !collapsed }) : null;

    const isSelectable = selectable && !!batch;
    const isSelected = isSelectable && stores.import.manager.search.getIsSelected(batch.id);
    const totalBytes = batch
      ? batch.size
      : folder
        ? folder.imports.reduce((acc, cur) => acc + cur.size, 0)
        : null;

    const { css, cx } = useClasses({
      collapsed,
      collapsible,
      fill,
      hasCollection,
      hasTags,
      isHeaderOnly: collapsed && !hasCollection && !hasTags,
      isSelectable,
      isSelected,
      listHeight: folder ? getImportFolderListHeight(folder.imports.length) : null,
    });

    /** Clicking a batch's header toggles it, and Shift selects the range up to it. */
    const handleHeaderClick = async (event: React.MouseEvent) => {
      const res = await stores.import.manager.search.handleSelect({
        hasCtrl: !event.shiftKey,
        hasShift: event.shiftKey,
        id: batch.id,
      });

      if (!res?.success) toast.error(res.error);
    };

    const handlePageChange = (page: number) => batch.loadPage(page);

    /** Status chips filter the batch's files, expanding it to show them. */
    const handleStatusClick = (event: React.MouseEvent, status: ImportStatus) => {
      event.stopPropagation();
      batch.toggleStatus(status);
      batch.setPage(1);

      if (collapsed) setCollapsed(false);
      else batch.loadPage(1);
    };

    const openFolder = async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (!folderPath) return;

      const error = await shell.openPath(folderPath);

      if (error) toast.error(error);
    };

    const toggleCollapsed = (event: React.MouseEvent) => {
      event.stopPropagation();
      setCollapsed(!collapsed);
    };

    useEffect(() => {
      if (batch && !collapsed) batch.loadPage();
    }, [batch, collapsed]);

    useEffect(() => {
      listRef.current?.element?.scrollTo({ top: 0 });
    }, [batch?.page]);

    return !folder ? null : (
      <Card
        flex={fill ? 1 : "none"}
        minHeight={fill ? 0 : undefined}
        overflow="hidden"
        padding={{ all: 0 }}
        height={batch || fill ? undefined : height}
        width="100%"
        bgColor={colors.foregroundCard}
      >
        <View
          spacing="0.5rem"
          onClick={isSelectable ? handleHeaderClick : undefined}
          className={css.header}
        >
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
              margins={collapsible ? { left: "-0.3em" } : undefined}
              iconProps={{ size: "0.9em" }}
            />

            <Text onClick={isSelectable ? undefined : openFolder} className={css.folderPath}>
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

            {isLinked && (
              <TooltipWrapper tooltip="In a linked folder: imports keep these files in place, and Medior never moves or deletes them.">
                <Chip label="Linked" icon="Link" className={css.chip} />
              </TooltipWrapper>
            )}

            {batch &&
              (Object.keys(IMPORT_STATUSES) as ImportStatus[]).map(
                (status) =>
                  (batch.statusCounts[status] > 0 || batch.statuses.includes(status)) && (
                    <TooltipWrapper key={status} tooltip={IMPORT_STATUSES[status].label}>
                      <Chip
                        size="small"
                        icon={IMPORT_STATUSES[status].icon}
                        label={Fmt.commas(batch.statusCounts[status] ?? 0)}
                        bgColor={IMPORT_STATUSES[status].color}
                        onClick={(event) => handleStatusClick(event, status)}
                        className={cx(
                          css.statusChip,
                          batch.statuses.length > 0 &&
                            !batch.statuses.includes(status) &&
                            css.unfilteredStatusChip,
                        )}
                      />
                    </TooltipWrapper>
                  ),
              )}

            {batch && !batch.isReady && <Chip label="Upload incomplete" className={css.chip} />}

            {subtitleCount > 0 && (
              <Chip label={`${Fmt.commas(subtitleCount)} subtitles`} className={css.chip} />
            )}

            {/* Size and file count come last, so status chips never shift them. */}
            <Chip label={Fmt.bytes(totalBytes)} className={css.chip} />

            <Chip
              label={`${Fmt.commas(batch?.fileCount ?? folder.imports.length)} files`}
              className={css.chip}
            />
          </View>
        </View>

        {hasCollection && (
          <View column className={css.collection}>
            <Text className={css.collectionTitle}>{title}</Text>
          </View>
        )}

        {hasTags && (
          <TagRow tags={folder.tags} virtualized={folder.tags.length > 30} className={css.tags} />
        )}

        {!collapsed && (
          <View column className={css.list}>
            {batch?.loadError && <Text color={colors.custom.red}>{batch.loadError}</Text>}

            <List
              listRef={listRef}
              rowComponent={ImportRow}
              rowCount={folder.imports.length}
              rowHeight={IMPORT_LIST_ITEM_HEIGHT}
              rowKey={getImportRowKey}
              rowProps={{ imports: folder.imports, noStatus }}
              className={css.listRows}
            />

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

interface ImportRowProps {
  imports: Folder["imports"];
  noStatus: boolean;
}

const ImportRow = ({ imports, index, noStatus, style }: RowComponentProps<ImportRowProps>) => (
  <ImportListItem
    batchImports={imports}
    fileImport={imports[index]}
    noStatus={noStatus}
    bgColor={index % 2 === 1 ? (Color(colors.control).fade(0.65).string() as CssColor) : undefined}
    style={style}
  />
);

const getImportRowKey = (index: number, { imports }: ImportRowProps) =>
  imports[index].id ?? imports[index].path;

const getImportFolderListHeight = (count: number) => {
  return 3 + Math.min(count * IMPORT_LIST_ITEM_HEIGHT, MAX_VISIBLE_FILES * IMPORT_LIST_ITEM_HEIGHT);
};

export const getImportFolderHeight = ({ folder, withListItems }: ImportFolderListProps) => {
  return (
    HEADER_HEIGHT +
    (folder?.collectionTitle?.length ? COLL_HEIGHT : 0) +
    (folder?.tags?.length ? TAGS_HEIGHT : 0) +
    (withListItems ? getImportFolderListHeight(folder?.imports?.length) : 0)
  );
};

interface ClassesProps extends Pick<ImportFolderListProps, "collapsible" | "fill"> {
  collapsed: boolean;
  hasCollection: boolean;
  hasTags: boolean;
  isHeaderOnly: boolean;
  isSelectable: boolean;
  isSelected: boolean;
  listHeight: number;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: IMPORT_CHIP_STYLE,
  collection: {
    borderBottom: props.collapsed && !props.hasTags ? undefined : `1px solid ${colors.border}`,
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
    ...makeBorderRadiuses({ bottom: props.isHeaderOnly ? "0.5rem" : 0, top: "0.5rem" }),
    borderBottom: props.isHeaderOnly ? undefined : `1px solid ${colors.border}`,
    padding: "0.5rem",
    paddingLeft: props.collapsible ? "0" : undefined,
    height: HEADER_HEIGHT,
    backgroundColor: props.isSelected ? colors.custom.blue : undefined,
    cursor: props.isSelectable ? "pointer" : undefined,
    userSelect: props.isSelectable ? "none" : undefined,
  },
  list: {
    flex: props.fill ? 1 : undefined,
    minHeight: 0,
    overflow: "hidden",
  },
  listRows: {
    flex: props.fill ? 1 : undefined,
    minHeight: 0,
    height: props.fill ? undefined : props.listHeight,
  },
  statusChip: {
    flexShrink: 0,
  },
  tags: {
    alignItems: "center",
    borderBottom: !props.collapsed ? `1px solid ${colors.border}` : undefined,
    boxSizing: "border-box",
    flexShrink: 0,
    height: TAGS_HEIGHT,
    overflowX: "auto",
    padding: "0 0.3rem 0 0.5rem",
  },
  unfilteredStatusChip: {
    opacity: 0.4,
  },
}));
