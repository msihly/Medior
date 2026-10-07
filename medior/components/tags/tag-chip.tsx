import Color from "color";
import { Chip, ChipProps, Comp, Icon, IconName, TagToUpsert, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, CssColor, makeClasses } from "medior/utils/client";
import { BadgeWrapper } from "./tag-chip-badge";

const HEIGHT_MEDIUM = 32;
const HEIGHT_SMALL = 26;

export interface TagChipProps extends Omit<ChipProps, "color" | "label" | "onChange" | "onClick"> {
  color?: CssColor;
  hasEditor?: boolean;
  onClick?: (id: string | null) => void;
  tag: TagToUpsert;
}

export const TagChip = Comp(
  ({
    className,
    color,
    hasEditor = false,
    icon,
    onClick,
    size = "small",
    tag,
    ...props
  }: TagChipProps) => {
    const stores = useStores();
    const store = stores.tag;

    const category = store.getCategory(tag);

    color = color || category?.color || colors.custom.grey;
    icon = icon || (category?.icon as IconName);

    const { css, cx } = useClasses({ color, size });

    const handleClick = () => {
      onClick?.(tag.id ?? null);

      if (hasEditor && tag.id) {
        store.editor.setIsOpen(true);
        store.editor.loadTag({ id: tag.id });
      }
    };

    return !tag ? null : (
      <BadgeWrapper condition={!tag.id}>
        <Chip
          {...props}
          size={size}
          onClick={onClick || (hasEditor && tag.id) ? handleClick : null}
          className={cx(css.chip, className)}
          label={
            <View row align="center">
              {!icon ? null : (
                <Icon name={icon} size="1em" margins={{ left: "0.3rem", right: "-0.2rem" }} />
              )}

              <Text tooltip={tag.label} tooltipProps={{ flexShrink: 1 }} className={css.label}>
                {tag.label}
              </Text>
            </View>
          }
        />
      </BadgeWrapper>
    );
  },
);

interface ClassesProps extends Pick<TagChipProps, "color" | "size"> {}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    "& .MuiChip-label": {
      padding: "0",
      width: "100%",
    },
    background: Color(props.color).lighten(0.2).fade(0.5).toString(),
    border: `2px solid ${props.color}`,
    borderRadius: 12,
    height: props.size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
    padding: "0.3em 0",
  },
  label: {
    overflow: "hidden",
    padding: "0 0.4rem",
    textOverflow: "ellipsis",
  },
}));
