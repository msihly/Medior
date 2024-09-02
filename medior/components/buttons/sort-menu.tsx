import { Button, Icon, IconName, IconProps, Text, View } from "medior/components";
import { ButtonProps, MenuButton, SortRow } from ".";
import { colors, CSS, makeClasses } from "medior/utils";

export interface SortMenuProps extends Omit<ButtonProps, "onChange" | "value"> {
  color?: string;
  rows: {
    attribute: string;
    label: string;
    icon: IconName;
    iconProps?: Partial<IconProps>;
  }[];
  setValue: (value: { isDesc: boolean; key: string }) => void;
  value: { isDesc: boolean; key: string };
  width?: CSS["width"];
}

export const SortMenu = ({
  color = colors.custom.black,
  rows,
  setValue,
  value,
  width = "fit-content",
  ...buttonProps
}: SortMenuProps) => {
  const { css, cx } = useClasses({ width });

  const activeRow = rows.find(({ attribute }) => attribute === value?.key);

  const renderButton = (onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void) => (
    <Button
      onClick={onOpen}
      color={color}
      justify="space-between"
      padding={{ left: "0.5em", right: "0.5em" }}
      className={cx(css.button, buttonProps?.className)}
      {...buttonProps}
    >
      <View row>
        <Icon name="Sort" size="1.15em" />

        <View column align="flex-start" margins={{ left: "0.5em", right: "0.5em" }}>
          <Text className={css.topText}>{"Sort By"}</Text>

          <Text className={css.label}>{activeRow?.label}</Text>
        </View>
      </View>

      <Icon name={value?.isDesc ? "ArrowDownward" : "ArrowUpward"} size="1.15em" />
    </Button>
  );

  return (
    <MenuButton button={renderButton}>
      <View column>
        {rows.map((rowProps) => (
          <SortRow {...rowProps} {...{ setValue, value }} key={rowProps.attribute} />
        ))}
      </View>
    </MenuButton>
  );
};

interface ClassesProps {
  width: CSS["width"];
}

const useClasses = makeClasses(({ width }: ClassesProps) => ({
  button: {
    width,
  },
  label: {
    fontSize: "0.9em",
    lineHeight: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  topText: {
    color: colors.custom.lightGrey,
    fontSize: "0.7em",
    fontWeight: 600,
    lineHeight: 1,
  },
}));
