import { Button, Text, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export const MULTI_INPUT_ROW_HEIGHT = 35;

export type MultiInputRowOption<T = string> = {
  label: string;
  value: T;
};

export interface MultiInputRowProps<T> {
  bgColor?: string;
  hasDelete?: boolean;
  leftNode?: React.ReactNode;
  onClick?: (value: T) => void;
  rightNode?: React.ReactNode;
  search: {
    onChange: (val: T[]) => void;
    value: T[];
  };
  style?: React.CSSProperties;
  value: T;
  valueExtractor?: (value: T) => string;
}

export const MultiInputRow = <T,>({ bgColor, ...props }: MultiInputRowProps<T>) => {
  bgColor = bgColor || colors.foreground;
  const hasClick = !!props.onClick;
  const { css } = useClasses({ bgColor, hasClick });

  const value = props.valueExtractor?.(props.value) ?? props.value;

  const handleClick = () => props.onClick?.(props.value);

  const handleDelete = () =>
    props.search.onChange(
      props.search.value.filter((v) => (props.valueExtractor?.(v) ?? v) !== value),
    );

  return (
    <View row className={css.root} style={props.style}>
      {props.leftNode}

      <View
        onClick={hasClick ? handleClick : null}
        row
        flex={1}
        overflow="hidden"
        padding={{ all: "0 0.3rem" }}
      >
        <Text
          tooltip={value}
          tooltipProps={{
            enterDelay: CONSTANTS.TOOLTIP.ENTER_DELAY,
            enterNextDelay: CONSTANTS.TOOLTIP.ENTER_NEXT_DELAY,
            flexShrink: 1,
          }}
          className={css.label}
        >
          {value}
        </Text>
      </View>

      {props.rightNode}

      {props.hasDelete && (
        <Button
          onClick={handleDelete}
          icon="Close"
          color="transparent"
          colorOnHover={colors.custom.red}
          boxShadow="none"
        />
      )}
    </View>
  );
};

interface ClassesProps {
  bgColor: string;
  hasClick: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  label: {
    padding: "0 0.3rem",
    fontSize: "0.8em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  root: {
    alignItems: "center",
    borderBottom: `1px solid ${colors.custom.black}`,
    height: MULTI_INPUT_ROW_HEIGHT,
    width: "100%",
    backgroundColor: props.bgColor,
    cursor: props.hasClick ? "pointer" : undefined,
  },
}));
