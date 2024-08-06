import { forwardRef, MutableRefObject, ReactNode } from "react";
import { CenteredText, View, ViewProps } from "medior/components";
import { CSS, makeClasses } from "medior/utils";

export interface CardGridProps extends ViewProps {
  cards: ReactNode[];
  cardsProps?: ViewProps;
  children?: ReactNode;
  noResultsText?: string;
  position?: CSS["position"];
}

export const CardGrid = forwardRef(
  (
    {
      cards,
      cardsProps,
      children,
      className,
      noResultsText = "No results found",
      position = "relative",
      ...props
    }: CardGridProps,
    ref: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({ hasCards: cards.length > 0, position });

    return (
      <View {...props} ref={ref} className={cx(css.root, className)}>
        {cards.length ? (
          <View {...cardsProps} className={cx(css.cards, cardsProps?.className)}>
            {cards}
          </View>
        ) : (
          <View column flex={1}>
            <CenteredText text={noResultsText} />
          </View>
        )}

        {children}
      </View>
    );
  }
);

interface ClassesProps {
  hasCards: boolean;
  position: CSS["position"];
}

const useClasses = makeClasses((theme, { hasCards, position }: ClassesProps) => ({
  cards: {
    display: "flex",
    flexFlow: "row wrap",
    flex: 1,
    paddingBottom: "7rem",
    overflowY: "auto",
    ...(!hasCards ? { height: "-webkit-fill-available" } : {}),
    "& > *": {
      overflow: "hidden",
      flexBasis: "calc(100% / 6)",
      [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 5)" },
      [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 4)" },
      [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 3)" },
      [theme.breakpoints.down("sm")]: { flexBasis: "calc(100% / 2)" },
    },
  },
  root: {
    position: position,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
  },
}));
