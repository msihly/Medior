import { ReactNode, useState } from "react";
import { Menu } from "@mui/material";
import { Divider, IconName, ListItem, View, ViewProps } from "medior/components";
import { colors, makeClasses } from "medior/utils";
import Color from "color";

interface MenuItem {
  color?: string;
  divider?: "bottom" | "top";
  icon: IconName;
  label: string;
}

export interface ContextMenuProps extends ViewProps {
  children: ReactNode;
  disabled?: boolean;
  id: string;
  menuItems: Array<
    MenuItem &
      (
        | { onClick?: never; subItems: Array<MenuItem & { onClick: () => void }> }
        | { onClick: () => void; subItems?: never }
      )
  >;
}

export const ContextMenu = ({ children, disabled, id, menuItems, ...props }: ContextMenuProps) => {
  const { css } = useClasses(null);

  const [mouseX, setMouseX] = useState(null);
  const [mouseY, setMouseY] = useState(null);

  const handleContext = (event) => {
    event.preventDefault();
    if (disabled) return;
    setMouseX(event.clientX - 2);
    setMouseY(event.clientY - 4);
  };

  const handleClose = () => {
    setMouseX(null);
    setMouseY(null);
  };

  return (
    <View {...props} id={id} onContextMenu={handleContext}>
      {children}

      <Menu
        open={mouseY !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          mouseX !== null && mouseY !== null ? { top: mouseY, left: mouseX } : undefined
        }
        PopoverClasses={{ paper: css.contextMenu }}
        MenuListProps={{ className: css.contextMenuInner }}
      >
        {menuItems.map((item) => [
          item.divider === "top" ? <Divider /> : null,
          <Item item={item} onClose={handleClose} />,
          item.divider === "bottom" ? <Divider /> : null,
        ])}
      </Menu>
    </View>
  );
};

const Item = ({
  item,
  onClose,
}: {
  item: ContextMenuProps["menuItems"][number];
  onClose: () => void;
}) => {
  const { css } = useClasses(null);

  const color = item.color || colors.custom.lightGrey;

  const handleClick = item.onClick
    ? () => {
        item.onClick();
        onClose();
      }
    : undefined;

  return (
    <ListItem
      key={item.label}
      text={item.label}
      icon={item.icon}
      iconProps={{ color }}
      color={color}
      iconEnd={item.subItems?.length ? "ChevronRight" : null}
      onClick={handleClick}
      className={css.item}
    >
      {item.subItems?.length ? (
        <View column>
          {item.subItems.map((subItem) => (
            <SubItem key={subItem.label} {...{ subItem, onClose }} />
          ))}
        </View>
      ) : null}
    </ListItem>
  );
};

const SubItem = ({
  onClose,
  subItem,
}: {
  onClose: () => void;
  subItem: ContextMenuProps["menuItems"][number]["subItems"][number];
}) => {
  const handleClick = () => {
    subItem.onClick();
    onClose();
  };

  return <ListItem text={subItem.label} icon={subItem.icon} onClick={handleClick} />;
};

const useClasses = makeClasses({
  contextMenu: {
    background: Color(colors.custom.black).fade(0.03).string(),
  },
  contextMenuInner: {
    padding: 0,
  },
  item: {
    padding: "0.35rem 1rem 0.35rem 0.7rem",
  },
});
