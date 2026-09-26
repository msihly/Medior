import { LinearProgress } from "@mui/material";
import { BackgroundOperationSchema } from "medior/_generated/server";
import { Card, Comp, Icon, Text, View } from "medior/components";
import { colors } from "medior/utils/client";
import { formatDate, OPERATION_STATUS_META } from "./activity-meta";
import { OperationControls } from "./operation-controls";

export const OperationCard = Comp(({ operation }: { operation: BackgroundOperationSchema }) => {
  const meta = OPERATION_STATUS_META[operation.status];

  return (
    <Card
      bgColor={colors.background}
      flex="none"
      minWidth={0}
      padding={{ all: "0.6rem" }}
      spacing="0.4rem"
      width="100%"
    >
      <View row align="center" justify="space-between" spacing="1rem">
        <View row flex={1} align="center" minWidth={0} spacing="0.5rem">
          <Icon color={meta.color} name={meta.icon} />

          <Text minWidth={0} overflowWrap="anywhere" whiteSpace="normal">
            {operation.label}
          </Text>
        </View>

        <View row flex="none" align="center" spacing="0.75rem">
          <Text color={meta.color} fontSize="0.8em" whiteSpace="nowrap">
            {`${operation.status} · ${
              operation.type === "mediaPathIndex"
                ? `${operation.processedCount.toLocaleString()} checked`
                : `${operation.processedCount} / ${operation.totalCount}`
            }`}
          </Text>

          <OperationControls operation={operation} />
        </View>
      </View>

      {operation.status === "PENDING" || operation.status === "RUNNING" ? (
        <LinearProgress
          value={operation.totalCount ? (operation.processedCount / operation.totalCount) * 100 : 0}
          variant={operation.totalCount ? "determinate" : "indeterminate"}
        />
      ) : null}

      {operation.type === "repair" && ["CANCELLED", "ERROR"].includes(operation.status) && (
        <Text whiteSpace="normal">
          {"Restart from Settings → Repair with the desired options."}
        </Text>
      )}

      <View maxHeight="12rem" minWidth={0} overflow="hidden auto" spacing="0.5rem">
        <Text
          color={operation.error ? colors.custom.red : colors.custom.lightGrey}
          flex={1}
          fontSize="0.8em"
          minWidth={0}
          overflowWrap="anywhere"
          whiteSpace="pre-wrap"
        >
          {operation.failures?.length
            ? `${operation.failures.length} failed; ${operation.processedCount} completed. Retry recoverable items, or remove failed transform records when their files are permanently gone.`
            : (operation.error ?? operation.message)}
        </Text>

        {operation.failures?.map((failure) => (
          <Text
            key={failure.targetId}
            color={colors.custom.red}
            fontSize="0.8em"
            minWidth={0}
            overflowWrap="anywhere"
            style={{ userSelect: "text" }}
            whiteSpace="pre-wrap"
          >
            {`Transform ${failure.targetId}\n${failure.message}`}
          </Text>
        ))}
      </View>

      <Text color={colors.custom.lightGrey} flex="none" fontSize="0.8em" whiteSpace="nowrap">
        {formatDate(operation.dateCreated)}
      </Text>
    </Card>
  );
});
