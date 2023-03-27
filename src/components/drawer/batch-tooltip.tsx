import { Tooltip, colors } from "@mui/material";
import { Tag, Text, View } from "components";
import { observer } from "mobx-react-lite";
import { ImportBatch } from "store";
import { dayjs, makeClasses } from "utils";

interface BatchTooltipProps {
  batch: ImportBatch;
  children: JSX.Element | JSX.Element[];
}

export const BatchTooltip = observer(({ batch, children }: BatchTooltipProps) => {
  const { css } = useClasses(null);

  return (
    <Tooltip
      arrow
      placement="bottom-end"
      classes={{ arrow: css.arrow, tooltip: css.tooltip }}
      title={
        <View column>
          <View row className={css.header}>
            <View column>
              <Text className={css.label}>{"Created"}</Text>
              <Text className={css.value}>{dayjs(batch.createdAt).fromNow()}</Text>
            </View>

            <View column margins={{ all: "0 1rem" }}>
              <Text className={css.label}>{"Started"}</Text>
              <Text className={css.value}>{dayjs(batch.startedAt).fromNow()}</Text>
            </View>

            <View column>
              <Text className={css.label}>{"Completed"}</Text>
              <Text className={css.value}>{dayjs(batch.completedAt).fromNow()}</Text>
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
      <View column className={css.icon}>
        {children}
      </View>
    </Tooltip>
  );
});

const useClasses = makeClasses({
  arrow: {
    color: colors.grey["900"],
  },
  header: {
    justifyContent: "space-between",
    fontSize: "1.1em",
  },
  icon: {
    justifyContent: "center",
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
  tooltip: {
    minWidth: "20rem",
    maxWidth: "25rem",
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 80%) 1px 2px 4px 0px",
  },
  value: {
    color: colors.grey["200"],
    textAlign: "center",
  },
});
