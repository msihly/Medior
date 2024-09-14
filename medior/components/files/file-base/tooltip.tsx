import { FileSchema } from "medior/database";
import { observer, useStores } from "medior/store";
import { Detail, DetailRow, TagChip, Text, Tooltip as TooltipBase, View } from "medior/components";
import { colors, dayjs, formatBytes, makeClasses } from "medior/utils";

interface TooltipProps {
  children: JSX.Element;
  disabled?: boolean;
  file: FileSchema;
}

export const Tooltip = observer(({ children, disabled, file }: TooltipProps) => {
  const { css } = useClasses(null);

  const stores = useStores();

  const onTagPress = (tagId: string) => {
    stores.tag.setActiveTagId(tagId);
    stores.tag.setIsTagEditorOpen(true);
  };

  return (
    <TooltipBase
      minWidth="15rem"
      title={
        <View className={css.root}>
          {file.tagIds?.length > 0 && (
            <View className={css.tags}>
              {file.tagIds.map((tagId) => (
                <TagChip
                  key={tagId}
                  id={tagId}
                  onClick={!disabled ? () => onTagPress(tagId) : undefined}
                  size="small"
                />
              ))}
            </View>
          )}

          <DetailRow>
            <Detail label="Size" value={formatBytes(file.size)} />

            <Detail label="Dimensions" value={`${file.width} x ${file.height}`} />
          </DetailRow>

          <DetailRow>
            <Detail label="Date Created" value={dayjs(file.dateCreated).fromNow()} />

            <Detail label="Date Modified" value={dayjs(file.dateModified).fromNow()} />
          </DetailRow>

          {file.diffusionParams?.length > 0 && (
            <Detail
              label="Diffusion Params"
              labelProps={{ textAlign: "center", marginTop: "0.5rem" }}
              value={
                <View className={css.diffContainer}>
                  <Text>{file.diffusionParams}</Text>
                </View>
              }
            />
          )}
        </View>
      }
    >
      <View column width="100%">
        {children}
      </View>
    </TooltipBase>
  );
});

const useClasses = makeClasses({
  diffContainer: {
    borderRadius: "0.25rem",
    padding: "0.4rem 0.6rem",
    maxHeight: "10rem",
    backgroundColor: colors.foreground,
    overflowY: "auto",
  },
  root: {
    display: "flex",
    flexDirection: "column",
    padding: "0.3rem",
    fontSize: "1.15em",
  },
  tags: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    padding: "0.3rem",
    "& > *": {
      marginBottom: "0.2rem",
      "&:not(:last-child)": {
        marginRight: "0.3rem",
      },
    },
  },
});
