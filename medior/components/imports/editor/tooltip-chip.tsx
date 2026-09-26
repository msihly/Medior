import { ReactNode } from "react";
import { Chip, IconName, Text, TooltipProps, TooltipWrapper, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";

export interface TooltipChipProps extends Partial<Omit<TooltipProps, "children">> {
  children: ReactNode | ReactNode[];
  icon: IconName;
  label: string;
}

export const TooltipChip = ({ children, icon, label, ...tooltipProps }: TooltipChipProps) => {
  const { css } = useClasses({});

  return (
    <TooltipWrapper
      tooltip={
        <View column padding={{ all: "0.5rem", top: "0.2rem" }}>
          <Text className={css.tooltipTitle}>{label}</Text>

          {children}
        </View>
      }
      tooltipProps={{
        maxWidth: "40rem",
        minWidth: "15rem",
        placement: "left-start",
        ...tooltipProps,
      }}
    >
      <Chip {...{ icon, label }} bgColor={colors.custom.blue} className={css.chip} />
    </TooltipWrapper>
  );
};

const useClasses = makeClasses({
  chip: {
    flexShrink: 0,
    height: "auto",
    minWidth: "4em",
    padding: "0.2em",
    width: "auto",
  },
  tooltipTitle: {
    color: colors.custom.blue,
    fontSize: "1.3em",
    fontWeight: 600,
    marginBottom: "0.2rem",
    textAlign: "center",
  },
});
