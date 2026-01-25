import { useState } from "react";
import { TagSchema } from "medior/_generated/server";
import { TagRow, Text, Tooltip, View } from "medior/components";
import { FileCollection } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export interface CollectionTooltipProps {
  children: JSX.Element;
  collection: FileCollection;
}

export const CollectionTooltip = ({ children, collection }: CollectionTooltipProps) => {
  const [tags, setTags] = useState<TagSchema[]>([]);

  const handleOpen = async () => {
    try {
      const res = await trpc.listTag.mutate({ filter: { id: collection.tagIds } });
      setTags(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Error loading tags");
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
            <TagRow tags={tags} />
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
