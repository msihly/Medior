import { forwardRef, MutableRefObject } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import { CenteredText, View, ViewProps } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { MULTI_INPUT_ROW_HEIGHT, MultiInputRow } from "./multi-input-row";

export interface MultiInputListProps<T = string> {
  hasInput?: boolean;
  renderRow?: (index: number, style: React.CSSProperties) => JSX.Element;
  search: {
    onChange: (val: T[]) => void;
    value: T[];
  };
  viewProps?: Partial<ViewProps>;
}

export const MultiInputList = forwardRef(
  <T,>(
    { hasInput, renderRow, search, viewProps = {}, ...props }: MultiInputListProps<T>,
    ref: MutableRefObject<FixedSizeList>,
  ) => {
    const { css } = useClasses({ hasInput });

    return (
      <View
        {...viewProps}
        column
        height="100%"
        borderRadiuses={{ all: "0.3rem", top: hasInput ? 0 : undefined }}
        className={css.listContainer}
      >
        {!search.value.length ? (
          <CenteredText text="No items" color={colors.custom.grey} />
        ) : (
          <View flex={1}>
            <AutoSizer disableWidth>
              {({ height }) => (
                <FixedSizeList
                  ref={ref}
                  height={height}
                  width="100%"
                  layout="vertical"
                  itemSize={MULTI_INPUT_ROW_HEIGHT}
                  itemCount={search.value.length}
                >
                  {({ index, style }) =>
                    renderRow ? (
                      renderRow(index, style)
                    ) : (
                      <MultiInputRow
                        key={index}
                        value={search.value[index]}
                        {...{ search, style }}
                        {...props}
                      />
                    )
                  }
                </FixedSizeList>
              )}
            </AutoSizer>
          </View>
        )}
      </View>
    );
  },
);

interface ClassesProps {
  hasInput: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  listContainer: {
    border: `1px dotted ${colors.custom.grey}`,
    borderTop: props.hasInput ? "none" : undefined,
    minHeight: "2.5rem",
    backgroundColor: "rgb(0 0 0 / 0.2)",
    overflowY: "auto",
  },
}));
