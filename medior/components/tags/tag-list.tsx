import { useEffect, useRef } from "react";
import { FixedSizeList } from "react-window";
import { Comp, MultiInputList, MultiInputListProps, TagInputRow, ViewProps } from "medior/components";
import { TagOption, useStores } from "medior/store";
import { socket } from "medior/utils/server";

export interface TagListProps extends MultiInputListProps<TagOption> {
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasSearchMenu?: boolean;
  hasInput?: boolean;
  viewProps?: Partial<ViewProps>;
}

export const TagList = Comp(
  ({ hasDelete, hasEditor, hasInput, hasSearchMenu, search }: TagListProps) => {
    const stores = useStores();

    const ref = useRef<FixedSizeList>();

    useEffect(() => {
      if (!socket?.isConnected || !search?.onChange) return;

      const onTagDeleted = (args: { ids: string[] }) => {
        search.onChange(search.value.filter((tag) => !args.ids.includes(tag.id)));
        rerender();
      };

      const onTagMerged = (args: { oldTagId: string; newTagId: string }) => {
        const newValue = stores.tag
          .listByIds([
            ...new Set(
              search.value.map((t) => t.id).map((id) => (id === args.oldTagId ? args.newTagId : id))
            ),
          ])
          .map((tag) => tag.tagOption);
        search.onChange(newValue);
        rerender();
      };

      const rerender = () => ref.current?.forceUpdate();

      socket.on("onTagDeleted", onTagDeleted);
      socket.on("onTagMerged", onTagMerged);

      return () => {
        socket.off("onTagDeleted", onTagDeleted);
        socket.off("onTagMerged", onTagMerged);
      };
    }, [socket?.isConnected, search?.value]);

    return (
      <MultiInputList
        {...{ hasInput, search }}
        ref={ref}
        renderRow={(index, style) => (
          <TagInputRow
            {...{ hasDelete, hasEditor, hasSearchMenu, search, style }}
            key={index}
            tag={search.value[index]}
          />
        )}
      />
    );
  }
);
