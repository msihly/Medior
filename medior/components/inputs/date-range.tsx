import { DateInput, DateInputProps, HeaderWrapperProps, RangeWrapper } from "medior/components";

export interface DateRangeProps {
  dateInputProps?: Partial<DateInputProps>;
  endDate: string;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  setEndDate: (val: string) => void;
  setStartDate: (val: string) => void;
  startDate: string;
};

export const DateRange = ({
  dateInputProps = {},
  endDate,
  header,
  headerProps,
  setEndDate,
  setStartDate,
  startDate,
}: DateRangeProps) => {
  return (
    <RangeWrapper
      header={header}
      headerProps={headerProps}
      startInput={
        <DateInput
          {...dateInputProps}
          value={startDate}
          setValue={setStartDate}
          inputProps={{ borderRadiuses: { top: 0, right: 0 } }}
        />
      }
      endInput={
        <DateInput
          {...dateInputProps}
          value={endDate}
          setValue={setEndDate}
          inputProps={{ borderRadiuses: { top: 0, left: 0 } }}
        />
      }
    />
  );
};
