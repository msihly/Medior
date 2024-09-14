import { ReactNode } from "react";
import {
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  ListItem as MuiListItem,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  ListItemProps as MuiListItemProps,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { Icon, IconName, IconProps, TooltipWrapper } from "medior/components";
import { Margins, colors, makeClasses } from "medior/utils";
import Color from "color";

export interface ListItemProps extends Omit<MuiListItemProps, "children"> {
  children?: ReactNode;
  color?: string;
  icon?: IconName;
  iconProps?: Partial<IconProps>;
  iconEnd?: IconName;
  iconEndMargins?: Margins;
  iconMargins?: Margins;
  onClick?: () => void;
  text: ReactNode;
}

const DEFAULT_ICON_END_MARGINS: Margins = { left: "1em" };
const DEFAULT_ICON_MARGINS: Margins = { right: "1em" };

export const ListItem = ({
  children,
  color,
  icon,
  iconProps,
  iconEnd,
  iconEndMargins,
  iconMargins,
  onClick,
  text,
  ...props
}: ListItemProps) => {
  iconMargins = { ...DEFAULT_ICON_MARGINS, ...iconMargins };
  iconEndMargins = { ...DEFAULT_ICON_END_MARGINS, ...iconEndMargins };

  const { css } = useClasses({ color });

  return (
    <TooltipWrapper
      tooltip={children}
      tooltipProps={{
        arrow: false,
        arrowColor: "transparent",
        bgColor: Color(colors.custom.black).fade(0.03).string(),
        classes: { tooltip: css.tooltip },
        placement: "right-start",
        PopperProps: { className: css.tooltipPopper },
      }}
    >
      {/* @ts-expect-error */}
      <MuiListItem onClick={onClick} button={Boolean(onClick)} className={css.root} {...props}>
        {icon && (
          <ListItemIcon className={css.icon}>
            <Icon {...iconProps} name={icon} margins={iconMargins} />
          </ListItemIcon>
        )}

        <ListItemText className={css.text}>{text}</ListItemText>

        {iconEnd && (
          <ListItemIcon className={css.icon}>
            <Icon name={iconEnd} margins={iconEndMargins} />
          </ListItemIcon>
        )}
      </MuiListItem>
    </TooltipWrapper>
  );
};

const useClasses = makeClasses(({ color }) => ({
  icon: {
    minWidth: 0,
  },
  root: {
    padding: "0.5rem 1rem",
  },
  text: {
    color,
  },
  tooltip: {
    margin: 0,
    padding: 0,
  },
  tooltipPopper: {
    marginLeft: "-0.75rem !important",
  },
}));
