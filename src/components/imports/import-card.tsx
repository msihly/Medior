import { shell } from "@electron/remote";
import { observer } from "mobx-react-lite";
import { FileImport } from "store";
import { FileBase, Icon, IMPORT_STATUSES, Text, TooltipWrapper, View, ViewProps } from "components";
import { colors, makeClasses, openCarouselWindow, trpc } from "utils";

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
          file: (await trpc.listFiles.mutate({ ids: [fileImport.fileId] })).data[0],
          selectedFileIds: [fileImport.fileId],
        })
      : shell.showItemInFolder(fileImport.path);

  return (
    <TooltipWrapper
      tooltip={
        <View column>
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
        onClick={handleClick}
        height={IMPORT_CARD_SIZE}
        width={IMPORT_CARD_SIZE}
        disabled
      >
        {fileImport?.thumbPaths?.length > 0 ? (
          <FileBase.Image
            thumbPaths={fileImport.thumbPaths}
            title={fileImport.path}
            rounded="all"
            height="100%"
            disabled
          >
            <FileBase.Chip
              position="top-left"
              label={<Icon name={status?.icon} color={status?.color} size={20} />}
              opacity={1}
              padding={{ all: 0 }}
              height="auto"
            />
          </FileBase.Image>
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
