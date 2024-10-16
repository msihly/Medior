import { useState } from "react";
import { FileCollection } from "medior/store";
import { TagRow, Text, Tooltip, View } from "medior/components";
import { colors, trpc } from "medior/utils";
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
          <Text
            color={colors.custom.lightBlue}
            fontSize="1.1em"
            fontWeight={600}
            textAlign="center"
          >
            {collection.title}
          </Text>

          <View row justify="center">
            <TagRow tagIds={tagIds} />
          </View>
        </View>
      }
    >
      <View column width="100%">
        {children}
      </View>
    </Tooltip>
  );
};
