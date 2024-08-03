import path from "path";
import { ModelCreationData } from "mobx-keystone";
import { FileImport, observer } from "medior/store";
import { FixedSizeList } from "react-window";
import { Divider } from "@mui/material";
import { Chip, Text, View } from "medior/components";
import { IMPORT_LIST_ITEM_HEIGHT, ImportListItem, TagHierarchy, TagToUpsert } from ".";
import { colors, makeClasses } from "medior/utils";

export interface ImportFolderListProps {
  collectionTitle?: string;
  imports: ModelCreationData<FileImport>[];
  tags?: TagToUpsert[];
}

export const ImportFolderList = observer(
  ({ collectionTitle, imports, tags }: ImportFolderListProps) => {
    const { css } = useClasses(null);

    return (
      <View className={css.container}>
        <View className={css.header}>
          <Text className={css.folderPath}>
            {imports[0]?.path && path.dirname(imports[0].path)}
          </Text>

          <Chip label={`${imports.length} files`} className={css.chip} />
        </View>

        {collectionTitle?.length > 0 && (
          <>
            <View className={css.collectionTitle}>
              <Text fontWeight={500} align="center" color={colors.blue["300"]}>
                {collectionTitle}
              </Text>
              <Text fontSize="0.7em">{"Collection"}</Text>
            </View>

            <Divider />
          </>
        )}

        {tags?.length > 0 && (
          <>
            <View className={css.tags}>
              {tags.map((tag) => (
                <TagHierarchy key={tag.label} tag={tag} className={css.tag} />
              ))}
            </View>

            <Divider />
          </>
        )}

        <View className={css.list}>
          <FixedSizeList
            layout="vertical"
            width="100%"
            height={Math.min(
              imports.length * IMPORT_LIST_ITEM_HEIGHT,
              7.5 * IMPORT_LIST_ITEM_HEIGHT
            )}
            itemSize={IMPORT_LIST_ITEM_HEIGHT}
            itemCount={imports.length}
          >
            {({ index, style }) => (
              <ImportListItem
                key={index}
                fileImport={imports[index]}
                color={index % 2 === 0 ? colors.blueGrey["200"] : colors.grey["200"]}
                style={style}
              />
            )}
          </FixedSizeList>
        </View>
      </View>
    );
  }
);

const useClasses = makeClasses({
  chip: {
    flexShrink: 0,
    padding: "0.2em",
    height: "auto",
    width: "auto",
    minWidth: "4em",
    marginLeft: "0.5rem",
  },
  collectionTitle: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.2rem 0.5rem",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    flex: "none",
    borderRadius: 4,
    marginBottom: "0.5rem",
    width: "inherit",
    backgroundColor: colors.grey["900"],
    overflowX: "auto",
  },
  folderPath: {
    color: colors.grey["200"],
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
    backgroundColor: colors.darkGrey,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    padding: "0.2rem 0",
    maxHeight: "20rem",
    overflowY: "auto",
  },
  tag: {
    padding: "0.2rem 0.4rem 0.2rem 0.2rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    padding: "0.2rem 0.3rem",
    overflowX: "auto",
  },
});
