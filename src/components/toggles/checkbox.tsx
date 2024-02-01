// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Checkbox as MuiCheckbox, FormControlLabel } from "@mui/material";
import { CSSObject } from "tss-react";
import { Padding, colors, makeClasses } from "utils";

export interface CheckboxProps {
  center?: boolean;
  checked: boolean;
  className?: string;
  color?: string;
  disabled?: boolean;
  flex?: CSSObject["flex"];
  fullWidth?: boolean;
  indeterminate?: boolean;
  label?: string;
  padding?: Padding;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({
  center = false,
  checked = false,
  className,
  color = colors.blue["600"],
  disabled = false,
  flex = 1,
  fullWidth = true,
  indeterminate,
  label,
  padding,
  setChecked,
}: CheckboxProps) => {
  const { css, cx } = useClasses({ center, color, disabled, flex, fullWidth, padding });

  const toggleChecked = () => setChecked(!checked);

  return (
    <FormControlLabel
      {...{ disabled, label }}
      control={
        <MuiCheckbox
          {...{ checked, disabled, indeterminate }}
          onClick={toggleChecked}
          className={css.checkbox}
        />
      }
      className={cx(css.label, className)}
    />
  );
};

interface ClassesProps {
  center: boolean;
  color: string;
  disabled: boolean;
  flex: CSSObject["flex"];
  fullWidth: boolean;
  padding?: Padding;
}

const useClasses = makeClasses(
  (_, { center, color, disabled, flex, fullWidth, padding }: ClassesProps) => ({
    checkbox: {
      padding: padding?.all,
      paddingTop: padding?.top,
      paddingBottom: padding?.bottom,
      paddingRight: padding?.right,
      paddingLeft: padding?.left,
      color: `${color} !important`,
      opacity: disabled ? 0.5 : 1,
    },
    label: {
      display: "flex",
      flex,
      justifyContent: center ? "center" : "auto",
      borderRadius: "0.5rem",
      marginLeft: 0,
      marginRight: 0,
      width: fullWidth ? "100%" : "auto",
      whiteSpace: "nowrap",
      transition: "all 200ms ease-in-out",
      userSelect: "none",
      "&:hover": {
        backgroundColor: colors.grey["800"],
      },
      "& .MuiFormControlLabel-label": {
        paddingRight: "0.4em",
      },
    },
  })
);
