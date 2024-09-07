import { ContextMenu, FileBase, Text } from "medior/components";
import { TagManagerTag, observer, useStores } from "medior/store";
import { CONSTANTS, colors, makeClasses, openSearchWindow } from "medior/utils";

export interface TagCardProps {
  tag: TagManagerTag;
}

export const TagCard = observer(({ tag }: TagCardProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const handleClick = async (event: React.MouseEvent) => {
    if (event.shiftKey) {
      const res = await stores.tag.manager.search.getShiftSelected({
        id: tag.id,
        selectedIds: stores.tag.manager.selectedIds,
      });
      if (!res?.success) throw new Error(res.error);

      stores.tag.manager.toggleTagsSelected([
        ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
        ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
      ]);
    } else if (event.ctrlKey) {
      /** Toggle the selected state of the tag that was clicked. */
      stores.tag.manager.toggleTagsSelected([
        { id: tag.id, isSelected: !stores.tag.manager.getIsSelected(tag.id) },
      ]);
    } else {
      /** Deselect all the tags and select the tag that was clicked. */
      stores.tag.manager.toggleTagsSelected([
        ...stores.tag.manager.selectedIds.map((id) => ({ id, isSelected: false })),
        { id: tag.id, isSelected: true },
      ]);
    }
  };

  const handleEdit = () => {
    stores.tag.setActiveTagId(tag.id);
    stores.tag.setIsTagEditorOpen(true);
  };

  const handleRefresh = () => stores.tag.refreshTag({ id: tag.id });

  const handleSearch = () => openSearchWindow({ tagIds: [tag.id] });

  return (
    <ContextMenu
      id={tag.id}
      menuItems={[
        { label: "Search", icon: "Search", onClick: handleSearch },
        { label: "Edit", icon: "Edit", onClick: handleEdit },
        { label: "Refresh", icon: "Refresh", onClick: handleRefresh },
      ]}
    >
      <FileBase.Container
        onClick={handleClick}
        onDoubleClick={handleEdit}
        selected={stores.tag.manager.selectedIds.includes(tag.id)}
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
            bgColor={colors.custom.blue}
          />
        </FileBase.Image>

        <FileBase.Footer>
          <Text tooltip={tag.label} tooltipProps={{ flexShrink: 1 }} className={css.title}>
            {tag.label}
          </Text>
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
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
