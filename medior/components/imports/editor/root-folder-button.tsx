import Color from "color";
import { Button, Comp, Text } from "medior/components";
import { ImportEditorStore } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

export interface RootFolderButtonProps {
  folderPart: string;
  index: number;
  store: ImportEditorStore;
}

export const RootFolderButton = Comp(({ folderPart, index, store }: RootFolderButtonProps) => {
  const isSelected = store.rootFolderIndex === index;

  const handleClick = () => store.setRootFolderIndex(index);

  return (
    <>
      {index !== 0 && <Text margins={{ all: "0 0.3em" }}>{"\\"}</Text>}

      <Button
        type="link"
        text={folderPart}
        onClick={handleClick}
        fontWeight={600}
        textColor={
          Color(colors.custom.lightBlue)
            .fade(!isSelected ? 0.3 : 0)
            .string() as CssColor
        }
      />
    </>
  );
});
