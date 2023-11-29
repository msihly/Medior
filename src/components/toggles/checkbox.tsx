// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Checkbox as MuiCheckbox, FormControlLabel } from "@mui/material";
import { colors, makeClasses } from "utils";

export interface CheckboxProps {
  center?: boolean;
  checked: boolean;
  className?: string;
  color?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  indeterminate?: boolean;
  label?: string;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({
  center = false,
  checked = false,
  className,
  color = colors.blue["600"],
  disabled = false,
  fullWidth = true,
  indeterminate,
  label,
  setChecked,
}: CheckboxProps) => {
  const { css, cx } = useClasses({ center, color, fullWidth });

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

const useClasses = makeClasses((_, { center, color, fullWidth }) => ({
  checkbox: {
    color: `${color} !important`,
  },
  label: {
    display: "flex",
    flex: 1,
    justifyContent: center ? "center" : "auto",
    borderRadius: "0.5rem",
    marginLeft: 0,
    marginRight: 0,
    marginBottom: "0.2rem",
    width: fullWidth ? "100%" : "auto",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      backgroundColor: colors.grey["800"],
    },
  },
}));
