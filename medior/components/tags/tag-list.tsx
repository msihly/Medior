import { useEffect, useRef } from "react";
import { FixedSizeList } from "react-window";
import { SocketEvents } from "medior/_generated/server";
import {
  Comp,
  MultiInputList,
  MultiInputListProps,
  sortTags,
  TagInputRow,
  TagInputRowProps,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { derefMobx, toast } from "medior/utils/client";
import { isDeepEqual } from "medior/utils/common";
import { socket } from "medior/utils/server";

export interface TagListProps extends MultiInputListProps<TagOption> {
  hasDelete?: boolean;
  hasDeleteAll?: boolean;
  hasEditor?: boolean;
  hasInput?: boolean;
  hasSearchMenu?: boolean;
  onTagClick?: (tagOpt: TagOption) => void;
  rightNode?: TagInputRowProps["rightNode"];
}

export const TagList = Comp(
  ({
    hasDelete,
    hasDeleteAll,
    hasEditor,
    hasInput,
    hasSearchMenu,
    onTagClick,
    rightNode,
    search,
  }: TagListProps) => {
    const stores = useStores();

    const ref = useRef<FixedSizeList>(null);
    const searchRef = useRef(search);

    searchRef.current = search;

    const tags = sortTags(search.value, stores.tag.getCategory);

    useEffect(() => {
      if (!socket?.isConnected) return;

      let isActive = true;

      const updateTags = (value: TagOption[]) => {
        if (!isActive || !searchRef.current.onChange || isDeepEqual(searchRef.current.value, value))
          return;

        searchRef.current = { ...searchRef.current, value };
        searchRef.current.onChange(value);
        ref.current?.forceUpdate();
      };

      const onTagDeleted = (args: Parameters<SocketEvents["onTagDeleted"]>[0]) => {
        const removedIds = new Set(args.ids);

        updateTags(searchRef.current.value.filter((tag) => !removedIds.has(tag.id)));
      };

      const onTagMerged = async (args: Parameters<SocketEvents["onTagMerged"]>[0]) => {
        if (
          !searchRef.current.onChange ||
          !searchRef.current.value.some((tag) => tag.id === args.oldTagId)
        )
          return;

        const res = await stores.tag.listByIds({ ids: [args.newTagId] });

        if (!isActive || !searchRef.current.value.some((tag) => tag.id === args.oldTagId)) return;

        if (!res.success || !res.data?.some((tag) => tag.id === args.newTagId))
          return toast.error("Failed to load merged tag");

        const option = tagToOption(res.data.find((tag) => tag.id === args.newTagId));
        const existingOption = searchRef.current.value.find((tag) => tag.id === args.newTagId);

        updateTags(
          searchRef.current.value.flatMap((tag) =>
            tag.id !== args.oldTagId
              ? [tag]
              : existingOption
                ? []
                : [{ ...option, searchType: tag.searchType ?? option.searchType }],
          ),
        );
      };

      const onTagUpdated = ({ id, updates }: Parameters<SocketEvents["onTagUpdated"]>[0]) => {
        onTagsUpdated({ tags: [{ tagId: id, updates }], withFileReload: false });
      };

      const onTagsUpdated = (args: Parameters<SocketEvents["onTagsUpdated"]>[0]) => {
        const updatesById = new Map(args.tags.map(({ tagId, updates }) => [tagId, updates]));
        const newValue = searchRef.current.value.map((tag) =>
          updatesById.has(tag.id)
            ? { ...derefMobx(tag), ...updatesById.get(tag.id) }
            : derefMobx(tag),
        );

        updateTags(newValue);
      };

      socket.on("onTagDeleted", onTagDeleted);
      socket.on("onTagMerged", onTagMerged);
      socket.on("onTagUpdated", onTagUpdated);
      socket.on("onTagsUpdated", onTagsUpdated);

      return () => {
        isActive = false;
        socket.off("onTagDeleted", onTagDeleted);
        socket.off("onTagMerged", onTagMerged);
        socket.off("onTagUpdated", onTagUpdated);
        socket.off("onTagsUpdated", onTagsUpdated);
      };
    }, [socket?.isConnected]);

    return (
      <MultiInputList
        ref={ref}
        hasDeleteAll={hasDeleteAll}
        hasInput={hasInput}
        search={{ onChange: search.onChange, value: tags }}
        renderRow={(index, style) => (
          <TagInputRow
            {...{ hasDelete, hasEditor, hasSearchMenu, rightNode, style }}
            key={index}
            search={{ onChange: search.onChange, value: tags }}
            tag={tags[index]}
            onClick={onTagClick}
          />
        )}
      />
    );
  },
);
