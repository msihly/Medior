import React, { ReactNode, useMemo, useState } from "react";
import {
    Paper,
    Table as MuiTable,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
} from "@mui/material";
import { colors, makeClasses } from "medior/utils/client";

const MUI_TABLE_ROW_HEIGHT = 33;

export interface TableColumn<T> {
  header: string;
  valueFunc: (row: T) => ReactNode;
  className?: string;
  wrap?: boolean;
}

export interface TableProps<T> {
  className?: string;
  columns: TableColumn<T>[];
  hasEmptyRows?: boolean;
  hasPagination?: boolean;
  rowCountOptions?: number[];
  paginationClassName?: string;
  rows: T[];
}

export const Table = <T extends object>({
  className,
  columns,
  hasEmptyRows = false,
  hasPagination = false,
  rowCountOptions = [10, 25, 50],
  rows,
  paginationClassName,
}: TableProps<T>) => {
  const { css, cx } = useClasses(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(rowCountOptions[0]);

  const handleRowsPerPageChange = (
    event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const displayedRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [page, rowsPerPage, rows]
  );

  const emptyRows = rowsPerPage - displayedRows.length;

  return (
    <>
      <TableContainer component={Paper} className={className}>
        <MuiTable size="small">
          <TableHead>
            <TableRow className={css.tableHeader}>
              {columns.map((column, i) => (
                <TableCell key={`${i}-${column.header}`} className={css.tableHeaderCell}>
                  {column.header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {displayedRows.map((row, rowKey) => (
              <TableRow key={`displayed-${rowKey}`} className={css.tableRowAlt}>
                {columns.map((column, cellKey) => (
                  <TableCellTrunc
                    key={`${rowKey}-${cellKey}`}
                    value={column.valueFunc(row)}
                    wrap={column.wrap}
                    className={column.className}
                  />
                ))}
              </TableRow>
            ))}

            {hasEmptyRows && emptyRows > 0 && (
              <TableRow
                className={css.tableRowAlt}
                style={{ height: MUI_TABLE_ROW_HEIGHT * emptyRows }}
              >
                <TableCell colSpan={columns.length} />
              </TableRow>
            )}
          </TableBody>
        </MuiTable>
      </TableContainer>

      {hasPagination && (
        <TablePagination
          count={rows.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          labelRowsPerPage="Row count :"
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={rowCountOptions}
          onRowsPerPageChange={handleRowsPerPageChange}
          className={cx(css.pagination, paginationClassName)}
        />
      )}
    </>
  );
};

interface TableCellTruncProps {
  className?: string;
  value: ReactNode;
  wrap?: boolean;
}

const TableCellTrunc = ({ className, value, wrap = false }: TableCellTruncProps) => {
  const { css, cx } = useClasses(null);

  return (
    <TableCell className={cx(css.tableCell, className)} title={String(value)}>
      {wrap ? <span className={css.wrapped}>{value}</span> : value}
    </TableCell>
  );
};

const useClasses = makeClasses({
  pagination: {
    borderBottom: "none",
    padding: 0,
  },
  tableHeader: {
    backgroundColor: colors.custom.blue,
  },
  tableHeaderCell: {
    color: colors.custom.white,
    fontWeight: 400,
    fontSize: "1em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tableCell: {
    maxWidth: "10em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  tableRowAlt: {
    "&:nth-of-type(even) > td": { backgroundColor: colors.custom.grey },
    "&:nth-of-type(odd) > td": { backgroundColor: colors.foreground },
  },
  wrapped: {
    display: "-webkit-inline-box",
    overflow: "hidden",
    whiteSpace: "normal",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
});
