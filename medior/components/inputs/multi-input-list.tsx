import { forwardRef, MutableRefObject } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import { Button, CenteredText, View, ViewProps } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { MULTI_INPUT_ROW_HEIGHT, MultiInputRow } from "./multi-input-row";

export interface MultiInputListProps<T = string> {
  hasDeleteAll?: boolean;
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
    {
      hasDeleteAll = false,
      hasInput,
      renderRow,
      search,
      viewProps = {},
      ...props
    }: MultiInputListProps<T>,
    ref: MutableRefObject<FixedSizeList>,
  ) => {
    const { css } = useClasses({ hasDeleteAll, hasInput });

    const handleDeleteAll = () => search.onChange([]);

    return (
      <View column height="100%">
        <View
          {...viewProps}
          column
          height="100%"
          borderRadiuses={{
            all: "0.3rem",
            top: hasInput ? 0 : undefined,
            bottom: hasDeleteAll ? 0 : undefined,
          }}
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

        {hasDeleteAll && (
          <Button
            text="Delete All"
            icon="Close"
            onClick={handleDeleteAll}
            colorOnHover={colors.custom.red}
            textColor={colors.custom.lightGrey}
            outlined
            width="100%"
            borderRadiuses={{ top: 0 }}
          />
        )}
      </View>
    );
  },
);

interface ClassesProps {
  hasDeleteAll: boolean;
  hasInput: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  listContainer: {
    border: `1px dotted ${colors.custom.grey}`,
    borderTop: props.hasInput ? "none" : undefined,
    borderBottom: props.hasDeleteAll ? "none" : undefined,
    minHeight: "2.5rem",
    backgroundColor: "rgb(0 0 0 / 0.2)",
    overflowY: "auto",
  },
}));
