import { forwardRef, MutableRefObject, ReactNode } from "react";
import { CenteredText, View, ViewProps } from "medior/components";
import { CSS, makeClasses } from "medior/utils";

export interface CardGridProps extends ViewProps {
  cards: ReactNode[];
  cardsProps?: ViewProps;
  children?: ReactNode;
  maxCards?: number;
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
      maxCards = 6,
      noResultsText = "No results found",
      padding = { all: "0.3rem 0.3rem 7rem" },
      position = "relative",
      ...props
    }: CardGridProps,
    ref: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({ hasCards: cards.length > 0, maxCards, position });

    return (
      <View {...props} ref={ref} className={cx(css.root, className)}>
        {cards.length ? (
          <View {...cardsProps} padding={padding} className={cx(css.cards, cardsProps?.className)}>
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
  maxCards: number;
  position: CSS["position"];
}

const useClasses = makeClasses((props: ClassesProps, theme) => ({
  cards: {
    display: "flex",
    flexFlow: "row wrap",
    flex: "initial",
    overflowY: "auto",
    ...(!props.hasCards ? { height: "-webkit-fill-available" } : {}),
    "& > *": {
      overflow: "hidden",
      flexBasis: `calc(100% / ${props.maxCards})`,
      [theme.breakpoints.down("xl")]: {
        flexBasis: `calc(100% / ${Math.max(0, props.maxCards - 1)})`,
      },
      [theme.breakpoints.down("lg")]: {
        flexBasis: `calc(100% / ${Math.max(0, props.maxCards - 2)})`,
      },
      [theme.breakpoints.down("md")]: {
        flexBasis: `calc(100% / ${Math.max(0, props.maxCards - 3)})`,
      },
      [theme.breakpoints.down("sm")]: {
        flexBasis: `calc(100% / ${Math.max(0, props.maxCards - 4)})`,
      },
    },
  },
  root: {
    position: props.position,
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflowY: "auto",
  },
}));
