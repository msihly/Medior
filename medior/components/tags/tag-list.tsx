import { useEffect } from "react";
import { SocketEvents } from "medior/_generated/server";
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

      const onTagDeleted = (args: Parameters<SocketEvents["onTagDeleted"]>[0]) => {
        search.onChange(search.value.filter((tag) => !args.ids.includes(tag.id)));
        rerender();
      };

      const onTagMerged = async (args: Parameters<SocketEvents["onTagMerged"]>[0]) => {
        const ids = [
          ...new Set(search.value.map((t) => (t.id === args.oldTagId ? args.newTagId : t.id))),
        ];
        const newValue = (await stores.tag.listByIds({ ids })).data.map(tagToOption);
        search.onChange(newValue);
        rerender();
      };

      const onTagsUpdated = (args: Parameters<SocketEvents["onTagsUpdated"]>[0]) => {
        for (const { tagId, updates } of args.tags) {
          const tagToUpdate = search.value.find((t) => t.id === tagId);
          if (tagToUpdate)
            search.onChange(search.value.map((t) => (t.id === tagId ? { ...t, ...updates } : t)));
        }
      };

      const rerender = () => ref?.current?.forceUpdate();

      socket.on("onTagDeleted", onTagDeleted);
      socket.on("onTagMerged", onTagMerged);
      socket.on("onTagsUpdated", onTagsUpdated);

      return () => {
        socket.off("onTagDeleted", onTagDeleted);
        socket.off("onTagMerged", onTagMerged);
        socket.off("onTagsUpdated", onTagsUpdated);
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
