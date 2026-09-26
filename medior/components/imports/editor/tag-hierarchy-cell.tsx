import { ListChildComponentProps } from "react-window";
import { Comp, View } from "medior/components";
import { TagHierarchyColumn, TagHierarchyColumnData } from "./tag-hierarchy-column";

export const TagHierarchyCell = Comp(
  ({ data, index, style }: ListChildComponentProps<TagHierarchyColumnData>) => (
    <View style={{ ...style, height: data.height }}>
      <TagHierarchyColumn
        {...data}
        index={index}
        tag={data.hierarchy.roots[index]}
        width={Number(style.width)}
      />
    </View>
  ),
);
