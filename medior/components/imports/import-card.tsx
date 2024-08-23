import { shell } from "@electron/remote";
import { FileImport, observer } from "medior/store";
import { FileBase, Icon, Text, TooltipWrapper, View, ViewProps } from "medior/components";
import { IMPORT_STATUSES } from ".";
import { colors, makeClasses, openCarouselWindow, trpc } from "medior/utils";

export const IMPORT_CARD_SIZE = 100;

export interface ImportCardProps {
  fileImport: FileImport;
  style?: ViewProps["style"];
}

export const ImportCard = observer(({ fileImport, style }: ImportCardProps) => {
  const { css } = useClasses(null);

  const hasFileId = fileImport.fileId?.length > 0;
  const status = IMPORT_STATUSES[fileImport.status];

  const handleClick = async () =>
    hasFileId
      ? openCarouselWindow({
          file: (await trpc.listFiles.mutate({ args: { filter: { id: [fileImport.fileId] } } }))
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
            <Text color={colors.text.blue} fontWeight={600} marginRight="0.3em">
              {"Path:"}
            </Text>
            {fileImport.path}
          </Text>

          {fileImport.errorMsg && (
            <Text marginTop="0.5em">
              <Text color={colors.text.red} fontWeight={600} marginRight="0.3em">
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
        {fileImport?.thumbPaths?.length > 0 ? (
          <FileBase.Image
            thumbPaths={fileImport.thumbPaths}
            title={fileImport.path}
            rounded="all"
            height="100%"
            disabled
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
