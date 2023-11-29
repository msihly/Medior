import { Tag, Text, Tooltip, View } from "components";
import { observer } from "mobx-react-lite";
import { ImportBatch } from "store";
import { colors, dayjs, makeClasses } from "utils";

interface BatchTooltipProps {
  batch: ImportBatch;
  children: JSX.Element | JSX.Element[];
}

export const BatchTooltip = observer(({ batch, children }: BatchTooltipProps) => {
  const { css } = useClasses(null);

  return (
    <Tooltip
      minWidth="20rem"
      title={
        <View column>
          <View row className={css.header}>
            <View column>
              <Text className={css.label}>{"Created"}</Text>
              <Text className={css.value}>{dayjs(batch.createdAt).fromNow()}</Text>
            </View>

            <View column margins={{ all: "0 1rem" }}>
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
            <View row className={css.tags}>
              {batch.tagIds.map((id) => (
                <Tag key={id} id={id} size="small" />
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
  header: {
    justifyContent: "space-between",
    fontSize: "1.1em",
  },
  label: {
    color: colors.blue["700"],
    fontWeight: 500,
    textAlign: "center",
  },
  tags: {
    justifyContent: "center",
    margin: "0.3rem 0 0.2rem",
  },
  value: {
    color: colors.grey["200"],
    textAlign: "center",
  },
});
