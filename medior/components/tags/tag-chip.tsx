import Color from "color";
import { TagSchema } from "medior/_generated";
import { Chip, ChipProps, Comp, Icon, IconName, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

const HEIGHT_MEDIUM = 32;
const HEIGHT_SMALL = 26;

export interface TagChipProps extends Omit<ChipProps, "color" | "label" | "onChange" | "onClick"> {
  color?: string;
  hasEditor?: boolean;
  onClick?: (id: string) => void;
  tag: TagSchema;
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
    if (!tag) return null;

    const stores = useStores();
    const category = stores.tag.getCategory(tag.categoryId);

    color = color || category?.color || colors.custom.grey;
    icon = icon || (category?.icon as IconName);

    const { css, cx } = useClasses({ color, size });

    const handleClick = () => {
      onClick?.(tag.id);
      if (hasEditor) {
        stores.tag.editor.setIsOpen(true);
        stores.tag.editor.loadTag(tag.id);
      }
    };

    return (
      <Chip
        {...props}
        onClick={hasEditor || onClick ? handleClick : null}
        size={size}
        className={cx(css.chip, className)}
        label={
          <View row align="center">
            {!icon ? null : <Icon name={icon} />}

            <Text tooltip={tag.label} tooltipProps={{ flexShrink: 1 }} className={css.label}>
              {tag.label}
            </Text>
          </View>
        }
      />
    );
  },
);

interface ClassesProps {
  color: string;
  size: ChipProps["size"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    border: `2px solid ${props.color}`,
    borderRadius: 12,
    padding: "0.3em 0",
    height: props.size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
    background: Color(props.color).lighten(0.2).fade(0.5).toString(),
    "& .MuiChip-label": {
      padding: "0",
      width: "100%",
    },
  },
  label: {
    padding: "0 0.4rem",
    lineHeight: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));
