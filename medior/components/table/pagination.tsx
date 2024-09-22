import {
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  Pagination as PaginationBase,
  PaginationProps as PaginationBaseProps,
} from "@mui/material";
import { colors, makeClasses } from "medior/utils";

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
      siblingCount={4}
      boundaryCount={2}
      className={cx(css.pagination, className)}
      {...props}
    />
  );
};

const useClasses = makeClasses({
  pagination: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 0,
    borderTop: "0.2rem solid #1b58a7",
    margin: 0,
    padding: "0.2rem 0.5rem 0.2rem",
    width: "100%",
    backgroundColor: colors.background,
    "& > ul": { justifyContent: "center" },
    "& li button": { borderRadius: "0.2rem" },
  },
});
