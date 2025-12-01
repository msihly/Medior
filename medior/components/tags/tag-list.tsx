import { useEffect } from "react";
import {
  Comp,
  MultiInputList,
  MultiInputListProps,
  TagInputRow,
  TagInputRowProps,
  ViewProps,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { socket } from "medior/utils/server";

export interface TagListProps extends MultiInputListProps<TagOption> {
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasSearchMenu?: boolean;
  hasInput?: boolean;
  onTagClick?: (tagOpt: TagOption) => void;
  rightNode?: TagInputRowProps["rightNode"];
  viewProps?: Partial<ViewProps>;
}

export const TagList = Comp(
  (
    { hasDelete, hasEditor, hasInput, hasSearchMenu, onTagClick, rightNode, search }: TagListProps,
    ref,
  ) => {
    const stores = useStores();

    useEffect(() => {
      if (!socket?.isConnected || !search?.onChange) return;

      const onTagDeleted = (args: { ids: string[] }) => {
        search.onChange(search.value.filter((tag) => !args.ids.includes(tag.id)));
        rerender();
      };

      const onTagMerged = async (args: { oldTagId: string; newTagId: string }) => {
        const ids = [
          ...new Set(search.value.map((t) => (t.id === args.oldTagId ? args.newTagId : t.id))),
        ];
        const newValue = (await stores.tag.listByIds({ ids })).data.items.map(tagToOption);
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
        ref={ref}
        hasInput={hasInput}
        search={search}
        renderRow={(index, style) => (
          <TagInputRow
            {...{ hasDelete, hasEditor, hasSearchMenu, rightNode, search, style }}
            key={index}
            tag={search.value[index]}
            onClick={onTagClick}
          />
        )}
      />
    );
  },
);
