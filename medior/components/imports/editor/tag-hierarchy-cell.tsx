import { CellComponentProps } from "react-window";
import { View } from "medior/components";
import { TagHierarchyColumn, TagHierarchyColumnData } from "./tag-hierarchy-column";

export const TagHierarchyCell = ({
  columnIndex,
  expanded,
  hierarchy,
  onToggle,
  onWidth,
  store,
  style,
}: CellComponentProps<TagHierarchyColumnData>) => (
  <View style={style}>
    <TagHierarchyColumn
      {...{ expanded, hierarchy, onToggle, onWidth, store }}
      height={Number(style.height)}
      tag={hierarchy.roots[columnIndex]}
      width={Number(style.width)}
    />
  </View>
);
