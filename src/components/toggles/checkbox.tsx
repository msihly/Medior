import { Checkbox as MuiCheckbox, colors, FormControlLabel } from "@mui/material";
import { CSSObject } from "tss-react/types";
import { makeStyles } from "utils";

interface CheckboxProps {
  checked: boolean;
  label?: string;
  setChecked: (checked: boolean) => void;
}

export const Checkbox = ({ checked = false, label, setChecked }: CheckboxProps) => {
  const { classes: css } = useClasses(null);

  return (
    <FormControlLabel
      {...{ label }}
      control={<MuiCheckbox {...{ checked }} onClick={() => setChecked(!checked)} />}
      className={css.label}
    />
  );
};

const useClasses = makeStyles<CSSObject>()(() => ({
  label: {
    display: "flex",
    flex: 1,
    borderRadius: "0.5rem",
    marginLeft: 0,
    marginRight: 0,
    marginBottom: "0.2rem",
    width: "100%",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      backgroundColor: colors.grey["800"],
    },
  },
}));
