import { useState } from "react";
import Color from "color";
import { TagSchema } from "medior/_generated/server";
import { Comp, ContextMenu, FileBase, getRatingMeta, Icon, Text, View } from "medior/components";
import { tagToOption, useStores } from "medior/store";
import { colors, makeClasses, openSearchWindow, toast } from "medior/utils/client";
import { Fmt, round } from "medior/utils/common";

export interface TagCardProps {
  tag: TagSchema;
}

export const TagCard = Comp(({ tag }: TagCardProps) => {
  const stores = useStores();
  const store = stores.tag;

  const category = store.getCategory(tag);
  const color = category?.color || "black";
  const ratingMeta = getRatingMeta(tag.rating);

  const { css } = useClasses({ textShadow: ratingMeta.textShadow });

  const [isHovering, setIsHovering] = useState(false);

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: tag.id,
    });

    if (!res?.success) toast.error(res.error);
  };

  const handleEdit = () => {
    store.editor.setIsOpen(true);
    store.editor.loadTag({ id: tag.id });
  };

  const handleFindTagsOnSameFiles = () => store.manager.findTagsOnSameFiles(tagToOption(tag));

  const handleMouseEnter = () => setIsHovering(true);

  const handleMouseLeave = () => setIsHovering(false);

  const handleRefresh = () => store.refreshTag({ id: tag.id });

  const handleSearch = () => openSearchWindow({ tagIds: [tag.id] });

  return (
    <ContextMenu
      id={tag.id}
      menuItems={[
        { icon: "Search", label: "Search", onClick: handleSearch },
        {
          icon: "FindInPage",
          label: "Find Tags on Same Files",
          onClick: handleFindTagsOnSameFiles,
        },
        { icon: "Edit", label: "Edit", onClick: handleEdit },
        { icon: "Refresh", label: "Refresh", onClick: handleRefresh },
      ]}
    >
      <FileBase.Container
        onClick={handleClick}
        onDoubleClick={handleEdit}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        selected={store.manager.search.getIsSelected(tag.id)}
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
            {!category?.icon ? null : <Icon name={category.icon} size="2em" />}

            <FileBase.FooterText
              text={tag.label}
              noTooltip
              textProps={{ fontSize: "1.3em", whiteSpace: "balance" }}
            />

            <FileBase.FooterText
              text={`${Fmt.commas(tag.count)} files / ${Fmt.bytes(tag.size ?? 0)}`}
              noTooltip
              textProps={{ color: colors.custom.lightGrey, fontSize: "0.8em" }}
            />

            <View row align="center" spacing="0.2rem">
              <Icon
                color={ratingMeta.iconColor}
                name={ratingMeta.icon}
                size="0.9em"
                className={css.rating}
              />

              <Text color={colors.custom.lightGrey} fontSize="0.8em">
                {round(tag.rating, 1)}
              </Text>
            </View>
          </View>
        </FileBase.Footer>
      </FileBase.Container>
    </ContextMenu>
  );
});

const useClasses = makeClasses((props: { textShadow: string }) => ({
  rating: {
    textShadow: props.textShadow,
  },
}));
