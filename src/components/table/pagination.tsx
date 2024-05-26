import {
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  Pagination as PaginationBase,
  PaginationProps as PaginationBaseProps,
} from "@mui/material";
import { colors, makeClasses } from "utils";
import Color from "color";

export interface PaginationProps extends Omit<PaginationBaseProps, "onChange"> {
  onChange: (page: number) => void;
}

export const Pagination = ({ className, onChange, ...props }: PaginationProps) => {
  const { css, cx } = useClasses(null);

  const handleChange = (_, page: number) => onChange(page);

  return (
    <PaginationBase
      onChange={handleChange}
      showFirstButton
      showLastButton
      siblingCount={2}
      boundaryCount={2}
      className={cx(css.pagination, className)}
      {...props}
    />
  );
};

const useClasses = makeClasses({
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRight: `3px solid ${colors.blue["800"]}`,
    borderLeft: `3px solid ${colors.blue["800"]}`,
    borderRadius: "0.5rem",
    margin: "0 auto",
    padding: "0.3rem",
    width: "fit-content",
    background: `linear-gradient(to top, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
    "& > ul": { justifyContent: "center" },
  },
});
