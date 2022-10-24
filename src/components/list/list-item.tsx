import {
  ListItem as MuiListItem,
  ListItemProps as MuiListItemProps,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { Icon, IconName } from "components";
import { makeClasses } from "utils";

export interface ListItemProps extends MuiListItemProps {
  color?: string;
  icon?: IconName;
  iconMargin?: string | number;
  onClick?: (...args: any) => void;
  paddingLeft?: string | number;
  paddingRight?: string | number;
  text: string;
}

export const ListItem = ({
  color,
  icon,
  iconMargin = "1rem",
  onClick,
  paddingLeft,
  paddingRight = "1em",
  text,
  ...props
}: ListItemProps) => {
  const { css } = useClasses({ iconMargin, paddingLeft, paddingRight });

  return (
    // @ts-expect-error
    <MuiListItem onClick={onClick} button={Boolean(onClick)} className={css.root} {...props}>
      {icon && (
        <ListItemIcon className={css.icon}>
          <Icon name={icon} />
        </ListItemIcon>
      )}

      <ListItemText color={color} className={css.text}>
        {text}
      </ListItemText>
    </MuiListItem>
  );
};

const useClasses = makeClasses((_, { iconMargin, paddingLeft, paddingRight }) => ({
  root: {
    padding: "0.5rem",
  },
  icon: {
    marginRight: iconMargin,
    paddingLeft: paddingLeft,
    minWidth: 0,
  },
  text: {
    paddingRight: paddingRight,
  },
}));
