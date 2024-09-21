import { MultiInputList, MultiInputListProps, TagInputRow, ViewProps } from "medior/components";
import { TagOption } from "medior/store";

export interface TagListProps extends MultiInputListProps<TagOption> {
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasSearchMenu?: boolean;
  hasInput?: boolean;
  viewProps?: Partial<ViewProps>;
}

export const TagList = ({
  hasDelete,
  hasEditor,
  hasInput,
  hasSearchMenu,
  search,
}: TagListProps) => {
  return (
    <MultiInputList
      {...{ hasInput, search }}
      renderRow={(index, style) => (
        <TagInputRow
          {...{ hasDelete, hasEditor, hasSearchMenu, search, style }}
          key={index}
          tag={search.value[index]}
        />
      )}
    />
  );
};
