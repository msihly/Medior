import {
  ListItem as MuiListItem,
  ListItemProps as MuiListItemProps,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { makeClasses } from "utils";

export interface ListItemProps extends MuiListItemProps {
  icon?: any;
  iconMargin?: string | number;
  onClick?: (...args: any) => void;
  paddingLeft?: string | number;
  paddingRight?: string | number;
  text: string;
}

const ListItem = ({
  icon,
  iconMargin = "1rem",
  onClick,
  paddingLeft,
  paddingRight = "1em",
  text,
  ...props
}: ListItemProps) => {
  const { classes: css } = useClasses({ iconMargin, paddingLeft, paddingRight });

  return (
    // @ts-expect-error
    <MuiListItem onClick={onClick} button={Boolean(onClick)} className={css.root} {...props}>
      {icon && <ListItemIcon className={css.icon}>{icon}</ListItemIcon>}
      <ListItemText className={css.text}>{text}</ListItemText>
    </MuiListItem>
  );
};

export default ListItem;

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
