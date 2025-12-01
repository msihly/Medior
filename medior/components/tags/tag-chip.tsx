import Color from "color";
import { TagSchema } from "medior/_generated";
import { Chip, ChipProps, Comp, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

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
    color = colors.custom.blue,
    hasEditor = false,
    onClick,
    size = "small",
    tag,
    ...props
  }: TagChipProps) => {
    if (!tag) return null;

    const { css, cx } = useClasses({ color, size });

    const stores = useStores();

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
            <View className={css.count}>
              {tag.count !== undefined ? Fmt.abbrevNum(tag.count) : "-"}
            </View>

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
    borderRadius: "0.6rem",
    padding: "0.3em 0",
    height: props.size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
    "& .MuiChip-label": {
      padding: "0",
      width: "100%",
    },
  },
  count: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "0.6rem 0 0 0.6rem",
    width: props.size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
    height: props.size === "medium" ? HEIGHT_MEDIUM : HEIGHT_SMALL,
    paddingLeft: "0.1em",
    fontSize: "0.7em",
    background: `linear-gradient(to bottom right, ${props.color}, ${Color(props.color).darken(0.3).string()})`,
  },
  label: {
    padding: "0 0.4rem 0 0.3rem",
    lineHeight: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));
