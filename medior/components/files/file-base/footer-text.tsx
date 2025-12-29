import { Text, TextProps } from "medior/components";
import { makeClasses } from "medior/utils/client";

interface FooterTextProps {
  noTooltip?: boolean;
  text: string;
  textProps?: Partial<TextProps>;
}

export const FooterText = (props: FooterTextProps) => {
  const { css } = useClasses(null);

  return (
    props.text?.length > 0 && (
      <Text
        {...props.textProps}
        fontSize={props.textProps?.fontSize || "0.9em"}
        whiteSpace={props.textProps?.whiteSpace || "nowrap"}
        tooltip={props.noTooltip ? undefined : props.text}
        tooltipProps={{ viewProps: { flex: 1 } }}
        className={css.title}
      >
        {props.text}
      </Text>
    )
  );
};

const useClasses = makeClasses({
  title: {
    padding: "0 0.4rem 0.2rem",
    width: "100%",
    textAlign: "center",
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
});
