import path from "path";
import { Card, Comp, ImportEditor, sortTags, Text, View } from "medior/components";
import { ImportEditorOptions, Ingester, Reingester } from "medior/store";
import { makeClasses } from "medior/utils/client";

export interface TagSelectorProps {
  options: ImportEditorOptions;
  store: Ingester | Reingester;
}

export const TagSelector = Comp(({ options, store }: TagSelectorProps) => {
  const shouldDisplay =
    options.folderToTagsMode !== "none" ||
    options.folderToCollectionMode === "withTag" ||
    (options.withDiffusionParams && options.withDiffusionTags);
  if (!shouldDisplay) return null;

  const { css } = useClasses(null);

  return (
    <Card width="100%">
      <View className={css.rootTagSelector}>
        <Text fontWeight={500} fontSize="0.9em" marginRight="0.5rem">
          {"Select Root Tag"}
        </Text>

        {[...store.rootFolderPath.split(path.sep).slice(0, -1), "**", "*"].map((p, i) => (
          <ImportEditor.RootFolderButton key={i} index={i} folderPart={p} store={store} />
        ))}
      </View>

      <View className={css.tags}>
        {sortTags(store.tagHierarchy).map((t) => (
          <ImportEditor.TagHierarchy key={t.label} tag={t} />
        ))}
      </View>
    </Card>
  );
});

const useClasses = makeClasses({
  rootTagSelector: {
    display: "flex",
    flexFlow: "row wrap",
    alignItems: "center",
    marginBottom: "0.3rem",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    maxHeight: "35vh",
    overflowX: "auto",
  },
});
