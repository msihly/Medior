import { DateInput, DateInputProps, Text, View } from "components";

export type DateRangeProps = {
  dateInputProps?: Partial<DateInputProps>;
  detachLabel?: boolean;
  endDate: string;
  endLabel: string;
  setEndDate: (val: string) => void;
  setStartDate: (val: string) => void;
  startDate: string;
  startLabel: string;
} & ({ column: boolean; row?: never } | { column?: never; row: boolean });

export const DateRange = ({
  column,
  dateInputProps = {},
  detachLabel = true,
  endDate,
  endLabel,
  row,
  setEndDate,
  setStartDate,
  startDate,
  startLabel,
}: DateRangeProps) => {
  return (
    <View {...{ column, row }} align="center" spacing="0.5rem">
      <DateInput
        {...dateInputProps}
        {...{ detachLabel }}
        label={startLabel}
        value={startDate}
        setValue={setStartDate}
      />

      {row && (
        <Text paddingTop="1.1rem" fontWeight={600}>
          {"-"}
        </Text>
      )}

      <DateInput
        {...dateInputProps}
        {...{ detachLabel }}
        label={endLabel}
        value={endDate}
        setValue={setEndDate}
      />
    </View>
  );
};
