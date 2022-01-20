import { ListItem as MuiListItem, ListItemIcon, ListItemText } from "@mui/material";
import { makeStyles } from "utils";

const ListItem = ({ icon, onClick, text, ...props }) => {
  const { classes: css } = useClasses();

  return (
    // @ts-expect-error
    <MuiListItem onClick={onClick} button={Boolean(onClick)} className={css.root} {...props}>
      {icon && <ListItemIcon className={css.icon}>{icon}</ListItemIcon>}
      <ListItemText className={css.text}>{text}</ListItemText>
    </MuiListItem>
  );
};

export default ListItem;

const useClasses = makeStyles()({
  root: {
    padding: "0.5rem",
  },
  icon: {
    marginRight: "1rem",
    minWidth: 0,
  },
  text: {
    paddingRight: "1em",
  },
});
