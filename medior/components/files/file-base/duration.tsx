import { FileBase, Icon, Text, View } from "medior/components";
import { File } from "medior/store";
import { Fmt } from "medior/utils/common";
import { ChipProps } from "./chip";

interface DurationProps extends Omit<ChipProps, "label"> {
  file: File;
}

export const Duration = ({ file, ...props }: DurationProps) => {
  return !file.duration ? null : (
    <FileBase.Chip
      {...props}
      label={
        <View row spacing="0.3em">
          {file.audioCodec === "None" && <Icon name="VolumeOff" size="1em" />}
          <Text>{Fmt.duration(file.duration)}</Text>
        </View>
      }
    />
  );
};
