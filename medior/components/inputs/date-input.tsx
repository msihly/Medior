import { ReactNode, useEffect, useState } from "react";
import { DatePicker, DatePickerProps } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { HeaderWrapper, Input, InputProps, ViewProps } from "medior/components";
import { CSS, dayjs, makeClasses } from "medior/utils";

export interface DateInputProps
  extends Omit<DatePickerProps<dayjs.Dayjs>, "label" | "onChange" | "value"> {
  header?: ReactNode;
  headerProps?: Partial<ViewProps>;
  inputProps?: Partial<InputProps>;
  setValue?: (val: string) => void;
  value: string;
  width?: CSS["width"];
}

export const DateInput = ({
  header,
  headerProps = {},
  inputProps = {},
  setValue,
  value,
  width,
  ...datePickerProps
}: DateInputProps) => {
  const { css } = useClasses({ width });

  const [dateValue, setDateValue] = useState<dayjs.Dayjs>(value?.length ? dayjs(value) : null);

  useEffect(() => {
    setDateValue(value?.length ? dayjs(value) : null);
  }, [value]);

  const handleChange = (val: dayjs.Dayjs) => setValue?.(val?.format("YYYY-MM-DD"));

  return (
    <HeaderWrapper header={header} headerProps={headerProps}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <DatePicker
          {...datePickerProps}
          value={dateValue}
          onChange={handleChange}
          slots={{
            textField: (props) => (
              <Input {...props} {...inputProps} value={props?.value as string} />
            ),
          }}
          slotProps={{ actionBar: { actions: ["cancel", "clear", "today"] } }}
          className={css.datePicker}
        />
      </LocalizationProvider>
    </HeaderWrapper>
  );
};

interface ClassesProps {
  width?: CSS["width"];
}

const useClasses = makeClasses((_, { width }: ClassesProps) => ({
  datePicker: {
    width,
    "& .MuiInputBase-input": {
      padding: "0.5rem 0 0.5rem 0.5rem",
    },
    "& .MuiIconButton-root": {
      padding: "0.2rem",
    },
    "& input": {
      fontSize: "0.9em",
    },
  },
}));
