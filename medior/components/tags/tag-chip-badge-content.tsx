import Color from "color";
import { Icon, View } from "medior/components";
import { colors, CssColor } from "medior/utils/client";

export const BadgeContent = () => {
  return (
    <View
      borderRadiuses={{ all: "50%" }}
      margins={{ left: "0.4rem", top: "0.2rem" }}
      bgColor={Color(colors.custom.green).lighten(0.9).string() as CssColor}
    >
      <Icon name="AddCircle" color={colors.custom.green} size={15} />
    </View>
  );
};
