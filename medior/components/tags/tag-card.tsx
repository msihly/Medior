import { useState } from "react";
import Color from "color";
import { TagSchema } from "medior/_generated/server";
import { Comp, ContextMenu, FileBase, Icon, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, openSearchWindow, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export interface TagCardProps {
  tag: TagSchema;
}

export const TagCard = Comp(({ tag }: TagCardProps) => {
  const stores = useStores();

  const color = tag.category?.color || "black";

  const [isHovering, setIsHovering] = useState(false);

  const handleClick = async (event: React.MouseEvent) => {
    const res = await stores.tag.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: tag.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleEdit = () => {
    stores.tag.editor.setIsOpen(true);
    stores.tag.editor.loadTag(tag.id);
  };

  const handleMouseEnter = () => setIsHovering(true);

  const handleMouseLeave = () => setIsHovering(false);

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        selected={stores.tag.manager.search.getIsSelected(tag.id)}
      >
        <FileBase.Image
          thumb={tag.thumb}
          title={tag.label}
          fit="contain"
          blur={isHovering ? 1 : 5}
        />

        <FileBase.Footer
          height="100%"
          align="center"
          background={`linear-gradient(to bottom, ${Color(color).fade(0.7).string()}, ${color})`}
        >
          <View column flex={1} align="center" justify="center">
            {!tag.category?.icon ? null : <Icon name={tag.category.icon} size="2em" />}

            <FileBase.FooterText
              text={tag.label}
              noTooltip
              textProps={{ fontSize: "1.3em", whiteSpace: "balance" }}
            />

            <FileBase.FooterText
              text={Fmt.commas(tag.count)}
              noTooltip
              textProps={{ color: colors.custom.lightGrey, fontSize: "0.8em" }}
            />
          </View>
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});
