import { shell } from "@electron/remote";
import { Comp, FileBase, Icon, Text, TooltipWrapper, View, ViewProps } from "medior/components";
import { FileImport } from "medior/store";
import { colors, makeClasses, openCarouselWindow } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { IMPORT_STATUSES } from ".";

export const IMPORT_CARD_SIZE = 125;

export interface ImportCardProps {
  fileImport: FileImport;
  style?: ViewProps["style"];
}

export const ImportCard = Comp(({ fileImport, style }: ImportCardProps) => {
  const { css } = useClasses(null);

  const hasFileId = fileImport.fileId?.length > 0;
  const status = IMPORT_STATUSES[fileImport.status];

  const handleClick = async () =>
    hasFileId
      ? openCarouselWindow({
          file: (await trpc.listFile.mutate({ args: { filter: { id: [fileImport.fileId] } } }))
            .data.items[0],
          selectedFileIds: [fileImport.fileId],
        })
      : shell.showItemInFolder(fileImport.path);

  return (
    <TooltipWrapper
      tooltip={
        <View column>
          <Text color={status?.color} fontWeight={600} align="center">
            {status?.label}
          </Text>

          <Text>
            <Text color={colors.custom.blue} fontWeight={600} marginRight="0.3em">
              {"Path:"}
            </Text>
            {fileImport.path}
          </Text>

          {fileImport.errorMsg && (
            <Text marginTop="0.5em">
              <Text color={colors.custom.red} fontWeight={600} marginRight="0.3em">
                {"Error:"}
              </Text>
              {fileImport.errorMsg}
            </Text>
          )}
        </View>
      }
      tooltipProps={{ style }}
    >
      <FileBase.Container
        onDoubleClick={handleClick}
        height={IMPORT_CARD_SIZE}
        width={IMPORT_CARD_SIZE}
      >
        {fileImport?.thumb ? (
          <FileBase.Image
            thumb={fileImport.thumb}
            title={fileImport.path}
            height={IMPORT_CARD_SIZE}
            rounded="all"
          />
        ) : (
          <Icon name={status?.icon} color={status?.color} size={50} className={css.icon} />
        )}
      </FileBase.Container>
    </TooltipWrapper>
  );
});

const useClasses = makeClasses({
  icon: {
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
});
