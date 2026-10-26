import { shell } from "@electron/remote";
import path from "path";
import { useEffect, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import Color from "color";
import type { ImportStatus } from "medior/server/database";
import {
  Card,
  Checkbox,
  Chip,
  Comp,
  ConfirmModal,
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
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem } from "./import-list-item";
import { IMPORT_CHIP_STYLE } from "./tooltip-chip";

const COLL_HEIGHT = 42;
const HEADER_HEIGHT = 43;
const TAGS_HEIGHT = 56;

type Folder = Pick<FlatFolder, "collectionTitle" | "imports" | "savedConfigLabel" | "tags">;

export interface ImportFolderListProps {
  collapsible?: boolean;
  /** Replaces the folder's collection title, such as a season titled after its renamed program. */
  collectionTitle?: string;
  folder: Folder;
  maxVisibleFiles?: number;
  noStatus?: boolean;
  /** Shows a checkbox that selects the batch in the Import Manager's search. */
  selectable?: boolean;
  withListItems?: boolean;
}

export const ImportFolderList = Comp(
  ({
    collapsible = false,
    collectionTitle,
    folder,
    maxVisibleFiles,
    noStatus = false,
    selectable = false,
    withListItems = true,
  }: ImportFolderListProps) => {
    const stores = useStores();

    const [collapsed, setCollapsed] = useState(!withListItems);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isReprocessConfirmOpen, setIsReprocessConfirmOpen] = useState(false);

    const listRef = useRef<FixedSizeList>(null);

    const batch = folder instanceof FileImportBatch ? folder : null;
    const folderPath =
      batch?.sourceFolderPath ??
      batch?.rootFolderPath ??
      (folder?.imports[0]?.path && path.dirname(folder.imports[0].path));

    const title = collectionTitle ?? folder?.collectionTitle;
    const hasCollection = title?.length > 0;
    const hasTags = folder?.tags?.length > 0;
    const subtitleCount = folder?.imports.reduce(
      (count, imp) => count + (imp.subtitles?.length ?? 0),
      0,
    );
    const height = folder
      ? getImportFolderHeight({ folder, maxVisibleFiles, withListItems: !collapsed })
      : null;

    const isSelected = !!batch && stores.import.manager.search.getIsSelected(batch.id);
    const totalBytes = batch
      ? batch.size
      : folder
        ? folder.imports.reduce((acc, cur) => acc + cur.size, 0)
        : null;

    const { css, cx } = useClasses({ collapsed, collapsible, hasCollection, hasTags });

    const deleteBatch = async () => {
      const res = await stores.import.manager.deleteBatches([batch.id]);
      if (!res.success) toast.error(res.error);

      return res.success;
    };

    const getItemKey = (index: number) => folder.imports[index].id ?? folder.imports[index].path;

    const handlePageChange = (page: number) => batch.loadPage(page);

    /** Checking a batch toggles it, and Shift selects the range up to it. */
    const handleSelectChange = async (
      _checked: boolean,
      _ternary: boolean,
      event: React.MouseEvent,
    ) => {
      const res = await stores.import.manager.search.handleSelect({
        hasCtrl: !event?.shiftKey,
        hasShift: !!event?.shiftKey,
        id: batch.id,
      });

      if (!res?.success) toast.error(res.error);
    };

    /** Status chips filter the batch's files, expanding it to show them. */
    const handleStatusClick = (status: ImportStatus) => {
      batch.toggleStatus(status);
      batch.setPage(1);

      if (collapsed) setCollapsed(false);
      else batch.loadPage(1);
    };

    const openDeleteConfirm = () => setIsDeleteConfirmOpen(true);

    const openFolder = async () => {
      if (!folderPath) return;

      const error = await shell.openPath(folderPath);

      if (error) toast.error(error);
    };

    const openReprocessConfirm = () => setIsReprocessConfirmOpen(true);

    const reprocessStoredFiles = async () => {
      const res = await stores.import.manager.reprocessStoredImports({ id: batch.id });
      if (!res.success) toast.error(res.error);
      else
        toast.success(
          `Requeued ${Fmt.commas(res.data.requeuedCount)} stored files and deleted ${Fmt.commas(res.data.deletedCount)} records. Resume importing to process them.`,
        );

      return res.success;
    };

    const toggleCollapsed = () => setCollapsed(!collapsed);

    useEffect(() => {
      if (batch && !collapsed) batch.loadPage();
    }, [batch, collapsed]);

    useEffect(() => {
      listRef.current?.scrollTo(0);
    }, [batch?.page]);

    return !folder ? null : (
      <Card
        flex="none"
        overflow="hidden"
        padding={{ all: 0 }}
        height={batch ? undefined : height}
        width="100%"
        bgColor={colors.background}
      >
        <View spacing="0.5rem" className={css.header}>
          <View row align="center" className={css.folderPath}>
            {selectable && batch && (
              <Checkbox
                checked={isSelected}
                setChecked={handleSelectChange}
                flex="none"
                width="auto"
                padding={{ all: "0.3em" }}
              />
            )}

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

            {subtitleCount > 0 && (
              <Chip label={`${Fmt.commas(subtitleCount)} subtitles`} className={css.chip} />
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
                        onClick={() => handleStatusClick(status)}
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

            {batch?.isReady && (
              <IconButton
                name="Refresh"
                tooltip="Reprocess Stored Files"
                onClick={openReprocessConfirm}
              />
            )}

            {batch ? (
              <IconButton
                name="Delete"
                tooltip="Delete Batch"
                onClick={openDeleteConfirm}
                iconProps={{ color: colors.custom.red }}
              />
            ) : null}
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

            <FixedSizeList
              ref={listRef}
              layout="vertical"
              width="100%"
              height={getImportFolderListHeight(folder.imports.length, maxVisibleFiles)}
              itemSize={IMPORT_LIST_ITEM_HEIGHT}
              itemCount={folder.imports.length}
              itemKey={getItemKey}
            >
              {({ index, style }) => (
                <ImportListItem
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

        {isDeleteConfirmOpen && (
          <ConfirmModal
            headerText="Delete Import Batch"
            subText={`Delete this batch of ${Fmt.commas(batch.fileCount)} files from import history? Unfinished imports are abandoned. Library files and import sources are kept.`}
            setVisible={setIsDeleteConfirmOpen}
            onConfirm={deleteBatch}
          />
        )}

        {isReprocessConfirmOpen && (
          <ConfirmModal
            headerText="Reprocess Stored Files"
            subText="Requeues stored files this batch copied, kept as duplicates, or failed. Files it re-created from originals of compressed or edited files, scratch leftovers, deleted files, or files in use are removed."
            confirmIcon="Refresh"
            confirmText="Reprocess"
            height="28rem"
            width="35rem"
            setVisible={setIsReprocessConfirmOpen}
            onConfirm={reprocessStoredFiles}
          />
        )}
      </Card>
    );
  },
);

const getImportFolderListHeight = (count: number, maxVisibleFiles = 12) => {
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
  statusChip: {
    flexShrink: 0,
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
  unfilteredStatusChip: {
    opacity: 0.4,
  },
}));
