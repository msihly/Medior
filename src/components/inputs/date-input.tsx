import { DatePicker, DatePickerProps } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ConditionalWrap, Text, TextProps, View } from "components";
import { dayjs, makeClasses } from "utils";
import { CSSObject } from "tss-react";
import { useEffect, useState } from "react";

export interface DateInputProps extends Omit<DatePickerProps<dayjs.Dayjs>, "onChange" | "value"> {
  detachLabel?: boolean;
  flex?: CSSObject["flex"];
  labelProps?: TextProps;
  setValue?: (val: string) => void;
  value: string;
  width?: CSSObject["width"];
}

export const DateInput = ({
  detachLabel = false,
  flex,
  label,
  labelProps = {},
  setValue,
  value,
  width,
  ...props
}: DateInputProps) => {
  const { css } = useClasses({ flex, width });

  const [dateValue, setDateValue] = useState<dayjs.Dayjs>(value?.length ? dayjs(value) : null);

  useEffect(() => {
    setDateValue(value?.length ? dayjs(value) : null);
  }, [value]);

  const handleChange = (val: dayjs.Dayjs) => setValue?.(val?.format("YYYY-MM-DD"));

  const wrap = (c: JSX.Element) => (
    <View column className={css.container}>
      <Text preset="label-glow" {...labelProps}>
        {label}
      </Text>
      {c}
    </View>
  );

  return (
    <ConditionalWrap condition={detachLabel} wrap={wrap}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DatePicker
          {...props}
          value={dateValue}
          onChange={handleChange}
          slotProps={{ actionBar: { actions: ["cancel", "clear", "today"] } }}
          className={css.datePicker}
        />
      </LocalizationProvider>
    </ConditionalWrap>
  );
};

interface ClassesProps {
  flex?: CSSObject["flex"];
  width?: CSSObject["width"];
}

const useClasses = makeClasses((_, { flex, width }: ClassesProps) => ({
  container: {
    flex,
    width,
  },
  datePicker: {
    width,
    backgroundColor: "rgb(0 0 0 / 0.2)",
    "& .MuiInputBase-input": {
      padding: "0.5rem 0 0.5rem 0.5rem",
    },
  },
}));
