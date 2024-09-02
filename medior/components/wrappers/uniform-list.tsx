import { ReactNode } from "react";
import { View, ViewProps } from "medior/components";
import { CSS, makeClasses } from "medior/utils";

export interface UniformListProps extends ViewProps {
  children: ReactNode | ReactNode[];
  uniformWidth?: CSS["maxWidth"];
}

export const UniformList = ({ children, uniformWidth, ...props }: UniformListProps) => {
  const { css, cx } = useClasses({ uniformWidth });

  return (
    <View {...props} className={cx(css.uniform, props?.className)}>
      {children}
    </View>
  );
};

interface ClassesProps {
  uniformWidth: CSS["maxWidth"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  uniform: {
    "& > *": {
      flexBasis: "100%",
      maxWidth: props.uniformWidth,
    },
  },
}));
