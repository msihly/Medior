import { Comp, View } from "medior/components";
import { FaceModel } from "medior/store";
import { makeClasses } from "medior/utils/client";

export interface FaceBoxProps {
  face: FaceModel;
  heightScale: number;
  offsetLeft: number;
  offsetTop: number;
  widthScale: number;
}

export const FaceBox = Comp(
  ({ face, heightScale, offsetLeft, offsetTop, widthScale }: FaceBoxProps) => {
    const { css } = useClasses({ face, heightScale, offsetLeft, offsetTop, widthScale });

    return (
      <View className={css.container}>
        <View className={css.faceBox} />
      </View>
    );
  },
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
    left: props.face.box.x * props.widthScale + props.offsetLeft,
    position: "absolute",
    top: props.face.box.y * props.heightScale + props.offsetTop,
  },
  faceBox: {
    border: `2px solid ${props.face.boxColor}`,
    borderRadius: "0.2rem",
    height: props.face.box.height * props.heightScale,
    width: props.face.box.width * props.widthScale,
  },
}));
