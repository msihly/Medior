import { TagChip, Text, Tooltip, View } from "medior/components";
import { useState } from "react";
import { toast } from "react-toastify";
import { FileCollection, observer, useStores } from "medior/store";
import { dayjs, makeClasses, trpc } from "medior/utils";

export interface CollectionTooltipProps {
  children: JSX.Element;
  collection: FileCollection;
}

export const CollectionTooltip = observer(({ children, collection }: CollectionTooltipProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const [tagIds, setTagIds] = useState<string[]>([]);
  const tags = stores.tag.listByIds(tagIds);

  const handleOpen = async () => {
    try {
      const res = await trpc.listFiles.mutate({
        args: { filter: { id: collection.fileIdIndexes.map(({ fileId }) => fileId) } },
      });
      if (!res?.success) throw new Error(res.error);

      const tagIds = [...new Set(res.data.items.flatMap((file) => file.tagIds))];
      setTagIds(tagIds);
    } catch (err) {
      console.error(err);
      toast.error("Error loading collection info");
    }
  };

  const onTagPress = (tagId: string) => {
    stores.tag.setActiveTagId(tagId);
    stores.tag.setIsTagEditorOpen(true);
  };

  return (
    <Tooltip
      onOpen={handleOpen}
      enterDelay={700}
      enterNextDelay={300}
      minWidth="20rem"
      title={
        <View column>
          <Text className={css.title}>{collection.title}</Text>

          <View row className={css.header}>
            <Text>{`Created ${dayjs(collection.dateCreated).fromNow()}`}</Text>
            <Text textAlign="right">{`Modified ${dayjs(collection.dateModified).fromNow()}`}</Text>
          </View>

          {tags?.length > 0 && (
            <View className={css.tags}>
              {tags.map((tag) => (
                <TagChip
                  key={tag.id}
                  tag={tag}
                  onClick={() => onTagPress(tag.id)}
                  size="small"
                  style={{ margin: "0 0.5em 0.5em 0" }}
                />
              ))}
            </View>
          )}
        </View>
      }
    >
      <View column width="100%">
        {children}
      </View>
    </Tooltip>
  );
});

const useClasses = makeClasses({
  header: {
    justifyContent: "space-between",
    padding: "0.3rem",
    fontSize: "1.1em",
    "& > *:not(:last-child)": {
      marginRight: "1rem",
    },
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    justifyContent: "center",
    margin: "0.3rem 0 0.2rem 0",
  },
  title: {
    fontSize: "1.2em",
    fontWeight: "bold",
    textAlign: "center",
  },
});
