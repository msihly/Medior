import { ConditionalWrap, View } from "medior/components";
import { makeClasses } from "medior/utils/client";
import { BadgeContent } from "./tag-chip-badge-content";

export interface BadgeWrapperProps {
  children: JSX.Element;
  condition: boolean;
}

export const BadgeWrapper = ({ children, condition }: BadgeWrapperProps) => {
  const { css } = useClasses(null);

  return (
    <ConditionalWrap
      condition={condition}
      wrap={(c) => (
        <View display="inline-flex" position="relative" flex="none">
          {c}

          <View className={css.badge}>
            <BadgeContent />
          </View>
        </View>
      )}
    >
      {children}
    </ConditionalWrap>
  );
};

const useClasses = makeClasses({
  badge: {
    position: "absolute",
    top: 0,
    left: 0,
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 20,
    minWidth: 20,
    padding: "0 6px",
    zIndex: 1,
  },
});
