import { Comp, FileBase, Icon, Text, View } from "medior/components";
import { File, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { CONSTANTS, VideoCodec } from "medior/utils/common";
import { ChipProps } from "./chip";

interface ExtAndIconsProps extends Omit<ChipProps, "label"> {
  file: File;
}

export const ExtAndIcons = Comp(({ file, ...props }: ExtAndIconsProps) => {
  const stores = useStores();

  return (
    <FileBase.Chip
      {...props}
      label={
        <View row spacing="0.3em">
          {!!stores.file.getFileLock(file.id) && (
            <Icon name="Lock" size="1em" color={colors.custom.orange} />
          )}

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

          {file.timestamps?.length > 0 && (
            <Icon name="Timeline" size="1em" color={colors.palette.teal[500]} />
          )}

          <View row align="center">
            <Text>{file.ext}</Text>

            {!CONSTANTS.VIDEO.CODECS.includes(file.videoCodec as VideoCodec) ? null : (
              <Text color={colors.custom.lightGrey}>{`/${file.videoCodec}`}</Text>
            )}
          </View>
        </View>
      }
    />
  );
});
