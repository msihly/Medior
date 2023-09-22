import { ReactElement, ReactNode } from "react";
import {
  ListItem as MuiListItem,
  ListItemProps as MuiListItemProps,
  ListItemIcon,
  ListItemText,
  Tooltip,
  colors,
} from "@mui/material";
import { ConditionalWrap, Icon, IconName } from "components";
import { Margins, makeClasses } from "utils";

export interface ListItemProps extends Omit<MuiListItemProps, "children"> {
  children?: ReactNode;
  color?: string;
  icon?: IconName;
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
  iconEnd,
  iconEndMargins,
  iconMargins,
  onClick,
  text,
  ...props
}: ListItemProps) => {
  iconMargins = { ...DEFAULT_ICON_MARGINS, ...iconMargins };
  iconEndMargins = { ...DEFAULT_ICON_END_MARGINS, ...iconEndMargins };

  const { css } = useClasses({ iconMargins, iconEndMargins });

  return (
    <ConditionalWrap
      condition={!!children}
      wrap={(c: ReactElement) => (
        <Tooltip
          title={children}
          placement="right-start"
          classes={{ tooltip: css.tooltip }}
          PopperProps={{ className: css.tooltipPopper }}
        >
          {c}
        </Tooltip>
      )}
    >
      {/* @ts-expect-error */}
      <MuiListItem onClick={onClick} button={Boolean(onClick)} className={css.root} {...props}>
        {icon && (
          <ListItemIcon className={css.icon}>
            <Icon name={icon} margins={iconMargins} />
          </ListItemIcon>
        )}

        <ListItemText color={color}>{text}</ListItemText>

        {iconEnd && (
          <ListItemIcon className={css.icon}>
            <Icon name={iconEnd} margins={iconEndMargins} />
          </ListItemIcon>
        )}
      </MuiListItem>
    </ConditionalWrap>
  );
};

const useClasses = makeClasses({
  icon: {
    minWidth: 0,
  },
  root: {
    padding: "0.5rem 1rem",
  },
  tooltip: {
    margin: 0,
    padding: 0,
    backgroundColor: colors.grey["900"],
  },
  tooltipPopper: {
    marginLeft: "-0.75rem !important",
  },
});
