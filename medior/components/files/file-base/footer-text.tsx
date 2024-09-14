import { Text } from "medior/components";
import { makeClasses } from "medior/utils";

interface FooterTextProps {
  text: string;
}

export const FooterText = (props: FooterTextProps) => {
  const { css } = useClasses(null);

  return (
    props.text?.length > 0 && (
      <Text tooltip={props.text} tooltipProps={{ viewProps: { flex: 1 } }} className={css.title}>
        {props.text}
      </Text>
    )
  );
};

const useClasses = makeClasses({
  title: {
    padding: "0 0.4rem 0.2rem",
    width: "100%",
    fontSize: "0.9em",
    textAlign: "center",
    textOverflow: "ellipsis",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
});
