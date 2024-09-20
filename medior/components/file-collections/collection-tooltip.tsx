import { useState } from "react";
import { FileCollection } from "medior/store";
import { Detail, TagRow, Text, Tooltip, View } from "medior/components";
import { dayjs, trpc } from "medior/utils";
import { toast } from "react-toastify";

export interface CollectionTooltipProps {
  children: JSX.Element;
  collection: FileCollection;
}

export const CollectionTooltip = ({ children, collection }: CollectionTooltipProps) => {
  const [tagIds, setTagIds] = useState<string[]>([]);

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

  return (
    <Tooltip
      onOpen={handleOpen}
      enterDelay={700}
      enterNextDelay={300}
      minWidth="25rem"
      title={
        <View column padding={{ all: "0.5rem" }}>
          <Text preset="title">{collection.title}</Text>

          <View row justify="space-between" spacing="1rem">
            <Detail
              label="Created"
              value={dayjs(collection.dateCreated).format("YYYY-MM-DD HH:mm A")}
            />

            <Detail
              label="Modified"
              value={dayjs(collection.dateModified).format("YYYY-MM-DD HH:mm A")}
            />
          </View>

          <TagRow tagIds={tagIds} />
        </View>
      }
    >
      <View column width="100%">
        {children}
      </View>
    </Tooltip>
  );
};
