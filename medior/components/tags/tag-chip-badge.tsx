import { Badge } from "@mui/material";
import { ConditionalWrap } from "medior/components";
import { BadgeContent } from "./tag-chip-badge-content";

export interface BadgeWrapperProps {
  children: JSX.Element;
  condition: boolean;
}

export const BadgeWrapper = ({ children, condition }: BadgeWrapperProps) => {
  return (
    <ConditionalWrap
      condition={condition}
      wrap={(c) => (
        <Badge
          badgeContent={<BadgeContent />}
          anchorOrigin={{ horizontal: "left", vertical: "top" }}
        >
          {c}
        </Badge>
      )}
    >
      {children}
    </ConditionalWrap>
  );
};
