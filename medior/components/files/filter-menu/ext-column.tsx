import { useMemo } from "react";
import { Checkbox, Comp, FileFilter, FileFilterProps, View } from "medior/components";
import { getConfig } from "medior/utils/client";
import { ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface ExtColumnProps extends Pick<FileFilterProps["ExtCheckbox"], "store" | "type"> {}

export const ExtColumn = Comp(({ store, type }: ExtColumnProps) => {
  const config = getConfig();

  const configTypes: FileFilterProps["ExtCheckbox"]["ext"][] =
    type === "ImageExt"
      ? (config.file.imageExts as ImageExt[])
      : type === "VideoExt"
        ? (config.file.videoExts as VideoExt[])
        : (config.file.videoCodecs as VideoCodec[]);

  const storeTypes =
    type === "ImageExt"
      ? store.selectedImageExts
      : type === "VideoExt"
        ? store.selectedVideoExts
        : store.selectedVideoCodecs;

  const [isAllSelected, isAnySelected] = useMemo(() => {
    const allTypes = Object.values(storeTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [storeTypes]);

  const toggleTypes = () => {
    const newTypes = Object.fromEntries(configTypes.map((t) => [t, isAllSelected ? false : true]));
    if (type === "ImageExt") store.setSelectedImageExts(newTypes);
    else if (type === "VideoExt") store.setSelectedVideoExts(newTypes);
    else store.setSelectedVideoCodecs(newTypes);
  };

  return (
    <>
      <Checkbox
        label={type === "ImageExt" ? "Images" : type === "VideoExt" ? "Videos" : "Codecs"}
        checked={isAllSelected}
        indeterminate={!isAllSelected && isAnySelected}
        setChecked={toggleTypes}
      />

      <View column margins={{ left: "0.5rem" }} overflow="hidden auto">
        {configTypes.map((ext) => (
          <FileFilter.ExtCheckbox key={ext} {...{ ext, store, type }} />
        ))}
      </View>
    </>
  );
});
