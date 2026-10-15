import { AreaChart, Button, CenteredText, Comp, LoadingOverlay, View } from "medior/components";
import { SizeHistoryRange, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { dayjs, Fmt } from "medior/utils/common";

const SIZE_HISTORY_RANGES: { label: string; value: SizeHistoryRange }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

export const SizeHistoryChart = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer;

  const totals = store.sizeTotals;

  const formatDate = (date: Date) => dayjs(date).format("MMM D, HH:mm");

  const handleRange = async (range: SizeHistoryRange) => {
    store.setSizeHistoryRange(range);

    const res = await store.loadSizeHistory();
    if (!res.success) toast.error(res.error);
  };

  return (
    <View column flex="none" spacing="0.5rem" width="30rem">
      <View row justify="flex-end" spacing="0.3rem">
        {SIZE_HISTORY_RANGES.map(({ label, value }) => (
          <Button
            key={value}
            text={label}
            onClick={() => handleRange(value)}
            color={store.sizeHistoryRange === value ? colors.custom.purple : colors.foregroundCard}
            colorOnHover={colors.custom.purple}
          />
        ))}
      </View>

      <View column position="relative" height="220px">
        <LoadingOverlay isLoading={store.isSizeHistoryLoading} />

        {totals.length ? (
          <AreaChart
            height={220}
            series={[
              {
                color: colors.custom.lightGrey,
                label: "Original",
                values: totals.map((total) => total.originalSize),
              },
              {
                color: colors.custom.blue,
                label: store.queueType === "reencode" ? "Compressed" : "Output",
                values: totals.map((total) => total.compressedSize),
              },
            ]}
            valueFormatter={Fmt.bytes}
            xValueFormatter={formatDate}
            xValues={totals.map((total) => total.date)}
          />
        ) : !store.isSizeHistoryLoading ? (
          <CenteredText
            text="No completed transforms in this period"
            color={colors.custom.lightGrey}
          />
        ) : null}
      </View>
    </View>
  );
});
