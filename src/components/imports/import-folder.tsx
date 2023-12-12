import path from "path";
import { observer } from "mobx-react-lite";
import { FileImport } from "store";
import { FixedSizeList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Text, View } from "components";
import { IMPORT_CARD_SIZE, ImportCard, TagHierarchy, TagToUpsert } from ".";
import { colors, formatBytes, makeClasses } from "utils";
import { Chip, Divider } from "@mui/material";
import Color from "color";

export interface ImportFolderProps {
  collectionTitle?: string;
  imports: FileImport[];
  mode: "cards" | "list";
  tags?: TagToUpsert[];
}

export const ImportFolder = observer(
  ({ collectionTitle, imports, mode, tags }: ImportFolderProps) => {
    const { css } = useClasses({ mode });

    return (
      <View className={css.container}>
        <View className={css.header}>
          <Text className={css.folderPath}>{path.dirname(imports[0].path)}</Text>

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

        {mode === "cards" ? (
          <View className={css.cards}>
            <AutoSizer disableHeight>
              {({ width }) => (
                <FixedSizeList
                  layout="horizontal"
                  width={width}
                  height={IMPORT_CARD_SIZE}
                  itemSize={IMPORT_CARD_SIZE}
                  itemCount={imports.length}
                >
                  {({ index, style }) => (
                    <ImportCard key={index} fileImport={imports[index]} style={style} />
                  )}
                </FixedSizeList>
              )}
            </AutoSizer>
          </View>
        ) : (
          <View className={css.list}>
            {imports.map((imp, i) => (
              <View key={imp.path} row align="center" justify="space-between">
                <Text
                  tooltip={imp.path}
                  tooltipProps={{ enterDelay: 1000, flexShrink: "inherit" }}
                  color={i % 2 === 0 ? colors.blueGrey["200"] : colors.grey["200"]}
                  className={css.listItem}
                >
                  {imp.name}
                </Text>

                <View row>
                  <Chip label={formatBytes(imp.size)} className={css.chip} />

                  <Chip label={imp.extension.substring(1)} className={css.chip} />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }
);

const useClasses = makeClasses((_, { mode }) => ({
  cards: {
    display: "flex",
    flexDirection: "row",
    width: "inherit",
    whiteSpace: "nowrap",
    overflowX: "auto",
  },
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
    width: "inherit",
    overflowX: "auto",
    ...(mode === "list"
      ? {
          borderRadius: 4,
          marginBottom: "0.5rem",
          backgroundColor: colors.grey["900"],
        }
      : {}),
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
    backgroundColor: Color(colors.grey["900"]).darken(0.4).string(),
  },
  list: {
    display: "flex",
    flexDirection: "column",
    padding: "0.2rem 0.5rem",
    maxHeight: "20rem",
    overflowY: "auto",
  },
  listItem: {
    flex: "none",
    width: "-webkit-fill-available",
    textOverflow: "ellipsis",
    textWrap: "nowrap",
  },
  tag: {
    padding: "0.2rem 0.4rem 0.2rem 0.2rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    padding: "0.2rem 0.3rem",
  },
}));
