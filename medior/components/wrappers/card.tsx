import { View, ViewProps } from ".";
import { CSS, makeClasses } from "medior/utils";

export interface CardProps extends Omit<ViewProps, "padding"> {
  bgColor?: CSS["backgroundColor"];
  borderRadius?: CSS["borderRadius"];
  padding?: CSS["padding"];
}

export const Card = ({
  bgColor = "rgb(0 0 0 / 0.3)",
  borderRadius = "0.5rem",
  children,
  className,
  padding = "1rem",
  ...props
}: CardProps) => {
  const { css, cx } = useClasses({ bgColor, borderRadius, padding });

  return (
    <View className={cx(css.root, className)} {...props}>
      {children}
    </View>
  );
};

interface ClassesProps {
  bgColor: CSS["backgroundColor"];
  borderRadius: CSS["borderRadius"];
  padding: CSS["padding"];
}

const useClasses = makeClasses((_, { bgColor, borderRadius, padding }: ClassesProps) => ({
  root: {
    position: "relative",
    backgroundColor: bgColor,
    borderRadius,
    padding,
  },
}));
