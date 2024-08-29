import {
  CenteredText,
  TAG_INPUT_ROW_HEIGHT,
  TagInputRow,
  TagInputRowProps,
  View,
  ViewProps,
} from "medior/components";
import { TagOption } from "medior/store";
import { BorderRadiuses, colors, deepMerge, makeClasses } from "medior/utils";
import { useCallback } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList, ListChildComponentProps } from "react-window";

const DEFAULT_BORDER_RADIUSES: BorderRadiuses = {
  all: "0.3rem",
};

export interface TagListProps extends Omit<TagInputRowProps, "tag"> {
  rowHeight?: number;
  tags: TagOption[];
  viewProps?: Partial<ViewProps>;
}

export const TagList = ({ rowHeight, tags, viewProps = {}, ...props }: TagListProps) => {
  const { css } = useClasses(null);

  const renderTagInputRow = useCallback(
    ({ index, style }: ListChildComponentProps) => (
      <TagInputRow key={index} tag={tags[index]} style={style} {...props} />
    ),
    [tags.length]
  );

  return (
    <View
      {...viewProps}
      column
      className={css.listContainer}
      borderRadiuses={deepMerge(DEFAULT_BORDER_RADIUSES, viewProps?.borderRadiuses ?? {})}
    >
      {!tags.length ? (
        <CenteredText text="No tags" color={colors.custom.grey} />
      ) : (
        <View flex={1}>
          <AutoSizer disableWidth>
            {({ height }) => (
              <FixedSizeList
                height={height}
                width="100%"
                layout="vertical"
                itemSize={rowHeight ?? TAG_INPUT_ROW_HEIGHT}
                itemCount={tags.length}
              >
                {renderTagInputRow}
              </FixedSizeList>
            )}
          </AutoSizer>
        </View>
      )}
    </View>
  );
};

const useClasses = makeClasses({
  listContainer: {
    border: `1px dotted ${colors.custom.grey}`,
    minHeight: "2.5rem",
    height: "100%",
    backgroundColor: "rgb(0 0 0 / 0.2)",
    overflowY: "auto",
  },
});
