import { MouseEvent, ReactNode } from "react";
import {
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  ListItem as MuiListItem,
  ListItemIcon,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  ListItemProps as MuiListItemProps,
  ListItemText,
} from "@mui/material";
import Color from "color";
import { Icon, IconName, IconProps, TooltipWrapper } from "medior/components";
import { colors, makeClasses, Margins } from "medior/utils/client";

export interface ListItemProps extends Omit<MuiListItemProps, "children"> {
  children?: ReactNode;
  color?: string;
  icon?: IconName;
  iconProps?: Partial<IconProps>;
  iconEnd?: IconName;
  iconEndMargins?: Margins;
  iconMargins?: Margins;
  onClick?: (event?: MouseEvent) => void;
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

  const { css, cx } = useClasses({ color });

  return (
    <TooltipWrapper
      tooltip={children}
      tooltipProps={{
        arrow: false,
        bgColor: Color(colors.custom.black).fade(0.03).string(),
        classes: { tooltip: css.tooltip },
        placement: "right-start",
        PopperProps: { className: css.tooltipPopper },
      }}
    >
      <MuiListItem
        // @ts-expect-error
        button={Boolean(onClick)}
        onClick={onClick}
        className={cx(css.root, props.className)}
        {...props}
      >
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

interface ClassesProps {
  color: string;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  icon: {
    minWidth: 0,
  },
  root: {
    padding: "0.1rem 0.8rem",
    "&:not(:last-child)": {
      borderBottom: `1px solid ${colors.custom.darkGrey}`,
    },
  },
  text: {
    color: props.color,
  },
  tooltip: {
    margin: 0,
    padding: 0,
  },
  tooltipPopper: {
    marginLeft: "-0.75rem !important",
  },
}));
