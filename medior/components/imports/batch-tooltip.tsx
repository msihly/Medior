import { FileImportBatch, observer } from "medior/store";
import { Detail, TagRow, Tooltip, View } from "medior/components";
import { dayjs } from "medior/utils";

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
            <Detail label="Created" value={dayjs(batch.dateCreated).format("YYYY-MM-DD HH:mm A")} />

            <Detail
              label="Started"
              value={batch.startedAt ? dayjs(batch.startedAt).format("YYYY-MM-DD HH:mm A") : "N/A"}
            />

            <Detail
              label="Completed"
              value={
                batch.completedAt ? dayjs(batch.completedAt).format("YYYY-MM-DD HH:mm A") : "N/A"
              }
            />
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
