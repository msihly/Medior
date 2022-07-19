import { Checkbox as MuiCheckbox, colors, FormControlLabel } from "@mui/material";
import { makeClasses } from "utils";

interface CheckboxProps {
  center?: boolean;
  checked: boolean;
  className?: string;
  fullWidth?: boolean;
  indeterminate?: boolean;
  label?: string;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({
  center = false,
  checked = false,
  className,
  fullWidth = true,
  indeterminate,
  label,
  setChecked,
}: CheckboxProps) => {
  const { classes: css, cx } = useClasses({ center, fullWidth });

  return (
    <FormControlLabel
      {...{ label }}
      control={<MuiCheckbox {...{ checked, indeterminate }} onClick={() => setChecked(!checked)} />}
      className={cx(css.label, className)}
    />
  );
};

const useClasses = makeClasses((_, { center, fullWidth }) => ({
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
