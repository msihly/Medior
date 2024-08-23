import { File, observer } from "medior/store";
import { Detail, DetailRow, Icon, Tag, Text, Tooltip as TooltipBase, View } from "medior/components";
import { colors, dayjs, formatBytes, makeClasses } from "medior/utils";

interface TooltipProps {
  disabled?: boolean;
  file: File;
  onTagPress?: (id: string) => any;
}

export const Tooltip = observer(({ disabled, file, onTagPress }: TooltipProps) => {
  const { css } = useClasses(null);

  return (
    <TooltipBase
      minWidth="15rem"
      title={
        <View className={css.root}>
          {file.tagIds?.length > 0 && (
            <View className={css.tags}>
              {file.tagIds.map((tagId) => (
                <Tag
                  key={tagId}
                  id={tagId}
                  onClick={!disabled ? () => onTagPress?.(tagId) : undefined}
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
      {file.diffusionParams?.length > 0 && (
        <Icon name="Notes" size="1em" color={colors.custom.blue} />
      )}

      <Icon
        name="InfoOutlined"
        color={colors.custom.grey}
        size="1em"
        margins={{ left: "0.3rem" }}
      />
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
