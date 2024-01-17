import { Button, IconName, IconProps, Text, View } from "components";
import { ButtonProps, MenuButton, SortRow } from ".";
import { colors, makeClasses } from "utils";
import { CSSObject } from "tss-react";

export interface SortMenuProps extends Omit<ButtonProps, "onChange" | "value"> {
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
  labelWidth = "5rem",
  rows,
  setValue,
  value,
  ...buttonProps
}: SortMenuProps) => {
  const { css } = useClasses({ labelWidth });

  const activeRow = rows.find(({ attribute }) => attribute === value.key);

  return (
    <MenuButton
      button={(onOpen) => (
        <Button
          icon="Sort"
          iconRight={value.isDesc ? "ArrowDownward" : "ArrowUpward"}
          onClick={onOpen}
          color={colors.grey["800"]}
          {...buttonProps}
        >
          <View column align="flex-start">
            <Text className={css.topText}>{"Sort By"}</Text>

            <Text className={css.label}>{activeRow?.label}</Text>
          </View>
        </Button>
      )}
    >
      <View column>
        {rows.map((rowProps) => (
          <SortRow {...rowProps} key={rowProps.attribute} value={value} setValue={setValue} />
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
