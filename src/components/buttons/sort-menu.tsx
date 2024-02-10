import { Button, Icon, IconName, IconProps, Text, View } from "components";
import { ButtonProps, MenuButton, SortRow } from ".";
import { colors, makeClasses } from "utils";
import { CSSObject } from "tss-react";

export interface SortMenuProps extends Omit<ButtonProps, "onChange" | "value"> {
  color?: string;
  labelWidth?: CSSObject["width"];
  rows: {
    attribute: string;
    label: string;
    icon: IconName;
    iconProps?: Partial<IconProps>;
  }[];
  setValue: (value: { isDesc: boolean; key: string }) => void;
  value: { isDesc: boolean; key: string };
}

export const SortMenu = ({
  color = colors.grey["800"],
  labelWidth = "5rem",
  rows,
  setValue,
  value,
  ...buttonProps
}: SortMenuProps) => {
  const { css } = useClasses({ labelWidth });

  const activeRow = rows.find(({ attribute }) => attribute === value.key);

  const renderButton = (onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void) => (
    <Button
      onClick={onOpen}
      color={color}
      justify="space-between"
      padding={{ left: "0.5em", right: "0.5em" }}
      {...buttonProps}
    >
      <View row>
        <Icon name="Sort" size="1.15em" />

        <View column align="flex-start" margins={{ left: "0.5em", right: "0.5em" }}>
          <Text className={css.topText}>{"Sort By"}</Text>

          <Text className={css.label}>{activeRow?.label}</Text>
        </View>
      </View>

      <Icon name={value.isDesc ? "ArrowDownward" : "ArrowUpward"} size="1.15em" />
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
  labelWidth?: CSSObject["width"];
}

const useClasses = makeClasses((_, { labelWidth }: ClassesProps) => ({
  label: {
    width: labelWidth,
    fontSize: "0.9em",
    lineHeight: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "left",
  },
  topText: {
    color: colors.text.grey,
    fontSize: "0.7em",
    fontWeight: 500,
    lineHeight: 1,
  },
}));
