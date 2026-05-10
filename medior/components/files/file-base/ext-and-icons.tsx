import { FileBase, Icon, Text, View } from "medior/components";
import { File } from "medior/store";
import { colors } from "medior/utils/client";
import { CONSTANTS, VideoCodec } from "medior/utils/common";
import { ChipProps } from "./chip";

interface ExtAndIconsProps extends Omit<ChipProps, "label"> {
  file: File;
}

export const ExtAndIcons = ({ file, ...props }: ExtAndIconsProps) => {
  return (
    <FileBase.Chip
      {...props}
      label={
        <View row spacing="0.3em">
          {!file.isAnimated && (
            <Icon
              name="Face"
              size="1.2em"
              color={file.hasFaceModels ? colors.custom.blue : colors.custom.grey}
            />
          )}

          {file.isCorrupted && <Icon name="Warning" size="1em" color={colors.custom.orange} />}

          {file.diffusionParams?.length > 0 && (
            <Icon name="Notes" size="1em" color={colors.custom.blue} />
          )}

          <View row align="center">
            <Text>{file.ext}</Text>
            {!CONSTANTS.VIDEO_CODECS.includes(file.videoCodec as VideoCodec) ? null : (
              <Text color={colors.custom.lightGrey}>{`/${file.videoCodec}`}</Text>
            )}
          </View>
        </View>
      }
    />
  );
};
