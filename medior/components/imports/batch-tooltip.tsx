import { FileImportBatch, observer } from "medior/store";
import { DateDetail, TagRow, Tooltip, View } from "medior/components";

interface BatchTooltipProps {
  batch: FileImportBatch;
  children: JSX.Element | JSX.Element[];
}

export const BatchTooltip = observer(({ batch, children }: BatchTooltipProps) => {
  return (
    <Tooltip
      minWidth="25rem"
      title={
        <View column>
          <View row spacing="1rem" justify="space-between">
            <DateDetail label="Created" value={batch.dateCreated} />

            <DateDetail label="Started" value={batch.startedAt} />

            <DateDetail label="Completed" value={batch.completedAt} />
          </View>

          <TagRow tagIds={batch.tagIds} />
        </View>
      }
    >
      <View column justify="center">
        {children}
      </View>
    </Tooltip>
  );
});
