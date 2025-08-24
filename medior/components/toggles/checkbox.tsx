import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Checkbox as MuiCheckbox, FormControlLabel } from "@mui/material";
import Color from "color";
import {
  colors,
  CSS,
  makeClasses,
  makeMargins,
  makePadding,
  Margins,
  Padding,
} from "medior/utils/client";

export interface CheckboxProps {
  center?: boolean;
  checked: boolean;
  className?: string;
  color?: string;
  disabled?: boolean;
  flex?: CSS["flex"];
  fullWidth?: boolean;
  indeterminate?: boolean;
  label?: ReactNode;
  margins?: Margins;
  padding?: Padding;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({
  center,
  checked,
  className,
  color = colors.custom.blue,
  disabled,
  flex = 1,
  fullWidth = true,
  indeterminate,
  label,
  margins = { left: 0, right: 0 },
  padding = { all: "0.3rem" },
  setChecked,
}: CheckboxProps) => {
  const { css, cx } = useClasses({ center, color, disabled, flex, fullWidth, margins, padding });

  const toggleChecked = () => !disabled && setChecked(!checked);

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
  flex: CSS["flex"];
  fullWidth: boolean;
  margins: Margins;
  padding: Padding;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  checkbox: {
    ...makePadding(props.padding),
    color: `${props.color} !important`,
    opacity: props.disabled ? 0.5 : 1,
  },
  label: {
    display: "flex",
    flex: props.flex,
    justifyContent: props.center ? "center" : undefined,
    borderRadius: "0.5rem",
    ...makeMargins(props.margins),
    width: props.fullWidth ? "100%" : "auto",
    whiteSpace: "nowrap",
    transition: "all 200ms ease-in-out",
    userSelect: "none",
    "&:hover": {
      backgroundColor: Color(colors.custom.blue).fade(0.8).string(),
    },
    "& .MuiFormControlLabel-label": {
      paddingRight: "0.4em",
    },
  },
}));
