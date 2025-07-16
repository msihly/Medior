import { useState } from "react";
import { TagSchema } from "medior/_generated";
import { Comp, DateDetail, TagRow, Tooltip, View } from "medior/components";
import { FileImportBatch } from "medior/store";
import { toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

interface BatchTooltipProps {
  batch: FileImportBatch;
  children: JSX.Element | JSX.Element[];
}

export const BatchTooltip = Comp(({ batch, children }: BatchTooltipProps) => {
  const [tags, setTags] = useState<TagSchema[]>([]);

  const handleOpen = async () => {
    try {
      const res = await trpc.listTag.mutate({ args: { filter: { id: batch.tagIds } } });
      setTags(res.data.items);
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
        <View column>
          <View row spacing="1rem" justify="space-between">
            <DateDetail label="Created" value={batch.dateCreated} />

            <DateDetail label="Started" value={batch.startedAt} />

            <DateDetail label="Completed" value={batch.completedAt} />
          </View>

          <TagRow tags={tags} />
        </View>
      }
    >
      <View column justify="center">
        {children}
      </View>
    </Tooltip>
  );
});
