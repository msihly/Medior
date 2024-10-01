import { ContextMenu, FileBase } from "medior/components";
import { TagManagerTag, observer, useStores } from "medior/store";
import { abbrevNum, colors, openSearchWindow } from "medior/utils";
import { toast } from "react-toastify";

export interface TagCardProps {
  tag: TagManagerTag;
}

export const TagCard = observer(({ tag }: TagCardProps) => {
  const stores = useStores();

  const handleClick = async (event: React.MouseEvent) => {
    const res = await stores.tag.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: tag.id,
    });
    if (!res?.success) toast.error(res.error);
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
        selected={stores.tag.manager.search.getIsSelected(tag.id)}
      >
        <FileBase.Image thumbPaths={tag.thumbPaths} title={tag.label} fit="contain">
          <FileBase.Chip
            position="top-left"
            label={abbrevNum(tag.count)}
            bgColor={colors.custom.blue}
          />
        </FileBase.Image>

        <FileBase.Footer>
          <FileBase.FooterText text={tag.label} />
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});
