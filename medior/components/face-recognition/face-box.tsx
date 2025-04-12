import { View } from "medior/components";
import { FaceModel, observer } from "medior/store";
import { makeClasses } from "medior/utils/client";

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

interface ClassesProps {
  face: FaceModel;
  heightScale: number;
  offsetLeft: number;
  offsetTop: number;
  widthScale: number;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  container: {
    position: "absolute",
    top: props.face.box.y * props.heightScale + props.offsetTop,
    left: props.face.box.x * props.widthScale + props.offsetLeft,
  },
  faceBox: {
    borderRadius: "0.2rem",
    border: `2px solid ${props.face.boxColor}`,
    width: props.face.box.width * props.widthScale,
    height: props.face.box.height * props.heightScale,
  },
}));
