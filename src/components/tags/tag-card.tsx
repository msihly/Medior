import { FileBase, Text } from "src/components";
import { TagManagerTag, observer, useStores } from "src/store";
import { CONSTANTS, colors, makeClasses } from "src/utils";

export interface TagCardProps {
  tag: TagManagerTag;
}

export const TagCard = observer(({ tag }: TagCardProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const handleClick = async (event: React.MouseEvent) => {
    if (event.shiftKey) {
      const res = await stores.tagManager.getShiftSelectedTags({
        id: tag.id,
        selectedIds: stores.tagManager.selectedIds,
      });
      if (!res?.success) throw new Error(res.error);

      stores.tagManager.toggleTagsSelected([
        ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
        ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
      ]);
    } else if (event.ctrlKey) {
      /** Toggle the selected state of the tag that was clicked. */
      stores.tagManager.toggleTagsSelected([
        { id: tag.id, isSelected: !stores.tagManager.getIsSelected(tag.id) },
      ]);
    } else {
      /** Deselect all the tags and select the tag that was clicked. */
      stores.tagManager.toggleTagsSelected([
        ...stores.tagManager.selectedIds.map((id) => ({ id, isSelected: false })),
        { id: tag.id, isSelected: true },
      ]);
    }
  };

  const handleDoubleClick = () => {
    stores.tag.setActiveTagId(tag.id);
    stores.tag.setIsTagEditorOpen(true);
  };

  return (
    <FileBase.Container
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      selected={stores.tagManager.selectedIds.includes(tag.id)}
    >
      <FileBase.Image
        thumbPaths={tag.thumbPaths}
        title={tag.label}
        height={CONSTANTS.THUMB.WIDTH}
        fit="contain"
      >
        <FileBase.Chip
          position="top-left"
          label={formatter.format(tag.count)}
          bgColor={colors.blue["700"]}
        />
      </FileBase.Image>

      <FileBase.Footer>
        <Text tooltip={tag.label} tooltipProps={{ flexShrink: 1 }} className={css.title}>
          {tag.label}
        </Text>
      </FileBase.Footer>
    </FileBase.Container>
  );
});

const formatter = Intl.NumberFormat("en", { notation: "compact" });

const useClasses = makeClasses({
  title: {
    width: "100%",
    fontSize: "0.9em",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
