import { Checkbox as MuiCheckbox, colors, FormControlLabel } from "@mui/material";
import { makeClasses } from "utils";

interface CheckboxProps {
  checked: boolean;
  fullWidth?: boolean;
  indeterminate?: boolean;
  label?: string;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({
  checked = false,
  fullWidth = true,
  indeterminate,
  label,
  setChecked,
}: CheckboxProps) => {
  const { classes: css } = useClasses({ fullWidth });

  return (
    <FormControlLabel
      {...{ label }}
      control={<MuiCheckbox {...{ checked, indeterminate }} onClick={() => setChecked(!checked)} />}
      className={css.label}
    />
  );
};

const useClasses = makeClasses((_, { fullWidth }) => ({
  label: {
    display: "flex",
    flex: 1,
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
