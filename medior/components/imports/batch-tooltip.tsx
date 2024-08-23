import { FileImportBatch, observer } from "medior/store";
import { Tag, Text, Tooltip, View } from "medior/components";
import { colors, dayjs, makeClasses } from "medior/utils";

interface BatchTooltipProps {
  batch: FileImportBatch;
  children: JSX.Element | JSX.Element[];
}

export const BatchTooltip = observer(({ batch, children }: BatchTooltipProps) => {
  const { css } = useClasses(null);

  return (
    <Tooltip
      minWidth="25rem"
      title={
        <View column>
          <View row spacing="1rem" justify="space-between">
            <View column>
              <Text className={css.label}>{"Created"}</Text>
              <Text className={css.value}>{dayjs(batch.dateCreated).fromNow()}</Text>
            </View>

            <View column>
              <Text className={css.label}>{"Started"}</Text>
              <Text className={css.value}>
                {batch.startedAt ? dayjs(batch.startedAt).fromNow() : "N/A"}
              </Text>
            </View>

            <View column>
              <Text className={css.label}>{"Completed"}</Text>
              <Text className={css.value}>
                {batch.completedAt ? dayjs(batch.completedAt).fromNow() : "N/A"}
              </Text>
            </View>
          </View>

          {batch.tagIds?.length > 0 && (
            <View className={css.tags}>
              {batch.tagIds.map((id) => (
                <Tag key={id} id={String(id)} size="small" className={css.tag} />
              ))}
            </View>
          )}
        </View>
      }
    >
      <View column justify="center">
        {children}
      </View>
    </Tooltip>
  );
});

const useClasses = makeClasses({
  label: {
    color: colors.custom.blue,
    fontWeight: 500,
    fontSize: "1.1em",
    textAlign: "center",
  },
  tag: {
    marginBottom: "0.3rem",
  },
  tags: {
    display: "flex",
    flexFlow: "row wrap",
    justifyContent: "center",
    margin: "0.3rem 0 0.2rem",
  },
  value: {
    color: colors.custom.lightGrey,
    fontSize: "1.1em",
    textAlign: "center",
  },
});
