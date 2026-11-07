import { ReactNode } from "react";
import { ButtonProps, Comp, Text, View, ViewProps } from "medior/components";
import { colors } from "medior/utils/client";

/** The thin border of media program panels. */
export const MEDIA_PROGRAM_BORDER = `1px solid ${colors.border}`;

/** The compact buttons that edit a program's details where they're shown. */
export const MEDIA_PROGRAM_BUTTON_PROPS: Partial<ButtonProps> = {
  fontSize: "0.75rem",
  fontWeight: 500,
  iconSize: "1.05rem",
  padding: { all: "0.15rem 0.45rem" },
};

export const MEDIA_PROGRAM_RADIUS = "0.4rem";

export interface MediaProgramSectionProps extends Omit<ViewProps, "title"> {
  actions?: ReactNode;
  children: ReactNode;
  /** Shown beside the title, such as counts. */
  info?: ReactNode;
  /** A muted line under the title. */
  subtitle?: string;
  title: ReactNode;
}

/** A part of the media program editor, titled with its actions on the right. */
export const MediaProgramSection = Comp(
  ({ actions, children, info, subtitle, title, ...viewProps }: MediaProgramSectionProps, ref) => (
    <View column spacing="0.5rem" {...viewProps} ref={ref}>
      <View row align="center" justify="space-between" spacing="0.5rem" minHeight="2.25rem">
        <View column minWidth={0}>
          <View row align="center" spacing="0.5rem" minWidth={0}>
            <Text fontSize="1.15em" fontWeight={700} minWidth={0}>
              {title}
            </Text>

            {info}
          </View>

          {subtitle && (
            <Text color={colors.custom.lightGrey} fontSize="0.8em" tooltip={subtitle}>
              {subtitle}
            </Text>
          )}
        </View>

        {actions && (
          <View row align="center" flex="none">
            {actions}
          </View>
        )}
      </View>

      {children}
    </View>
  ),
);
