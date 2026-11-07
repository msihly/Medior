import { ReactNode } from "react";
import Color from "color";
import { Comp, Icon, IconName, Text, View } from "medior/components";
import { colors, CssColor, makeClasses } from "medior/utils/client";

/** The thin border of media program panels and tags. */
export const MEDIA_PROGRAM_BORDER = "1px solid rgba(255, 255, 255, 0.07)";

/** The faint fill of media program panels. */
export const MEDIA_PROGRAM_PANEL_COLOR = "rgba(255, 255, 255, 0.03)";

export const MEDIA_PROGRAM_RADIUS = "0.4rem";

export interface MediaProgramPillProps {
  bgColor?: CssColor;
  color?: CssColor;
  icon?: IconName;
  iconColor?: CssColor;
  label: ReactNode;
  onClick?: (event: React.MouseEvent) => void;
}

/** The media program views' tag: a small label with an optional icon, clickable when editable. */
export const MediaProgramPill = Comp(
  ({
    bgColor = "rgba(255, 255, 255, 0.07)",
    color = colors.custom.white,
    icon,
    iconColor,
    label,
    onClick,
  }: MediaProgramPillProps) => {
    const { css } = useClasses({ bgColor, isClickable: !!onClick });

    return (
      <View
        row
        align="center"
        flex="none"
        spacing="0.25rem"
        padding={{ all: "0.15rem 0.45rem" }}
        bgColor={bgColor}
        borders={{ all: MEDIA_PROGRAM_BORDER }}
        borderRadiuses={{ all: "0.3rem" }}
        cursor={onClick ? "pointer" : undefined}
        onClick={onClick}
        className={css.pill}
      >
        {icon && <Icon name={icon} size="1.05em" color={iconColor ?? color} />}

        <Text color={color} fontSize="0.75em" fontWeight={500}>
          {label}
        </Text>
      </View>
    );
  },
);

interface ClassesProps extends Pick<MediaProgramPillProps, "bgColor"> {
  isClickable: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  pill: {
    maxWidth: "100%",
    transition: "background-color 150ms ease",
    userSelect: "none",
    "&:hover": props.isClickable
      ? { backgroundColor: Color(props.bgColor).mix(Color("#ffffff"), 0.12).string() }
      : undefined,
  },
}));
