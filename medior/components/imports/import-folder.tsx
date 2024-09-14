import path from "path";
import { observer } from "medior/store";
import { FixedSizeList } from "react-window";
import { Card, Chip, Text, View } from "medior/components";
import { FlatFolder, IMPORT_LIST_ITEM_HEIGHT, ImportListItem, TagHierarchy } from ".";
import { colors, makeClasses } from "medior/utils";
import Color from "color";

const COLL_HEIGHT = 64;
const HEADER_HEIGHT = 43;
const MAX_VISIBLE_FILES = 12;
const TAGS_HEIGHT = 46;

export const getImportFolderListHeight = (count: number) => {
  return 3 + Math.min(count * IMPORT_LIST_ITEM_HEIGHT, MAX_VISIBLE_FILES * IMPORT_LIST_ITEM_HEIGHT);
};

export const getImportFolderHeight = (folder: FlatFolder) => {
  return (
    getImportFolderListHeight(folder?.imports?.length) +
    HEADER_HEIGHT +
    (folder?.collectionTitle?.length ? COLL_HEIGHT : 0) +
    (folder?.tags?.length ? TAGS_HEIGHT : 0)
  );
};

export interface ImportFolderListProps {
  folder: FlatFolder;
}

export const ImportFolderList = observer(({ folder }: ImportFolderListProps) => {
  const height = getImportFolderHeight(folder);
  const { css } = useClasses(null);

  return (
    <Card column flex="none" padding={{ all: 0 }} height={height} bgColor={colors.background}>
      <View className={css.header}>
        <Text className={css.folderPath}>
          {folder.imports[0]?.path && path.dirname(folder.imports[0].path)}
        </Text>

        <Chip label={`${folder.imports.length} files`} className={css.chip} />
      </View>

      {folder?.collectionTitle?.length > 0 && (
        <View column className={css.collection}>
          <Text className={css.collectionTitle}>{folder.collectionTitle}</Text>
          <Text fontSize="0.7em" textAlign="center">{"Collection"}</Text>
        </View>
      )}

      {folder.tags.length > 0 && (
        <View row className={css.tags}>
          {folder.tags.map((tag) => (
            <TagHierarchy key={tag.label} tag={tag} className={css.tag} />
          ))}
        </View>
      )}

      <View column className={css.list}>
        <FixedSizeList
          layout="vertical"
          width="100%"
          height={getImportFolderListHeight(folder.imports.length)}
          itemSize={IMPORT_LIST_ITEM_HEIGHT}
          itemCount={folder.imports.length}
        >
          {({ index, style }) => (
            <ImportListItem
              key={index}
              fileImport={folder.imports[index]}
              bgColor={index % 2 === 1 ? Color(colors.foreground).fade(0.35).string() : undefined}
              style={style}
            />
          )}
        </FixedSizeList>
      </View>
    </Card>
  );
});

const useClasses = makeClasses({
  chip: {
    flexShrink: 0,
    padding: "0.2em",
    height: "auto",
    width: "auto",
    minWidth: "4em",
    marginLeft: "0.5rem",
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
    borderBottom: `1px solid ${colors.custom.grey}`,
    height: TAGS_HEIGHT,
    overflowX: "auto",
  },
});
