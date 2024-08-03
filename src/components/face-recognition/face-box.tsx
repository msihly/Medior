import { FaceModel, observer } from "src/store";
import { View } from "src/components";
import { makeClasses } from "src/utils";

export interface FaceBoxProps {
  face: FaceModel;
  heightScale: number;
  offsetLeft: number;
  offsetTop: number;
  widthScale: number;
}

export const FaceBox = observer(
  ({ face, heightScale, offsetLeft, offsetTop, widthScale }: FaceBoxProps) => {
    const { css } = useClasses({ face, heightScale, offsetLeft, offsetTop, widthScale });

    return (
      <View className={css.container}>
        <View className={css.faceBox} />
      </View>
    );
  }
);

const useClasses = makeClasses(
  (_, { face, heightScale, offsetLeft, offsetTop, widthScale }: FaceBoxProps) => ({
    container: {
      position: "absolute",
      top: face.box.y * heightScale + offsetTop,
      left: face.box.x * widthScale + offsetLeft,
    },
    faceBox: {
      borderRadius: "0.2rem",
      border: `2px solid ${face.boxColor}`,
      width: face.box.width * widthScale,
      height: face.box.height * heightScale,
    },
  })
);
