import { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { ModelCreationData } from "mobx-keystone";
import { FileImport } from "store";
import { Chip, IconName, Tag, Text, TooltipWrapper, View } from "components";
import { TagHierarchy } from ".";
import { colors, formatBytes, makeClasses } from "utils";

export const IMPORT_LIST_ITEM_HEIGHT = 30;

export interface ImportListItemProps {
  color?: string;
  fileImport: ModelCreationData<FileImport>;
  style?: React.CSSProperties;
}

export const ImportListItem = observer(
  ({ color = colors.grey["200"], fileImport, style = {} }: ImportListItemProps) => {
    const { css } = useClasses(null);

    return (
      <View key={fileImport.path} className={css.root} {...{ style }}>
        <Text
          tooltip={fileImport.path}
          tooltipProps={{ enterDelay: 1000, flexShrink: "inherit" }}
          color={color}
          className={css.name}
        >
          {fileImport.name}
        </Text>

        <View row>
          {(fileImport.tagIds?.length > 0 || fileImport.tagsToUpsert?.length > 0) && (
            <TooltipChip icon="Label" label="Tags">
              <View row justify="center">
                {fileImport.tagIds.map((id) => (
                  <Tag key={id} id={id} />
                ))}
              </View>

              <View row justify="center">
                {fileImport.tagsToUpsert.map((tag) => (
                  <TagHierarchy key={tag.label} tag={tag} />
                ))}
              </View>
            </TooltipChip>
          )}

          {fileImport.diffusionParams?.length > 0 && (
            <TooltipChip icon="Notes" label="Params">
              <Text>{fileImport.diffusionParams}</Text>
            </TooltipChip>
          )}

          <Chip label={formatBytes(fileImport.size)} className={css.chip} />

          <Chip label={fileImport.extension.substring(1)} className={css.chip} />
        </View>
      </View>
    );
  }
);

interface TooltipChipProps {
  children: ReactNode | ReactNode[];
  icon: IconName;
  label: string;
}

const TooltipChip = ({ children, icon, label }: TooltipChipProps) => {
  const { css } = useClasses({});

  return (
    <TooltipWrapper
      tooltip={
        <View column padding={{ all: "0.5rem", top: "0.2rem" }}>
          <Text className={css.tooltipTitle}>{label}</Text>
          {children}
        </View>
      }
      tooltipProps={{ maxWidth: "40rem", minWidth: "15rem", placement: "left" }}
    >
      <Chip {...{ icon, label }} bgColor={colors.blue["800"]} className={css.chip} />
    </TooltipWrapper>
  );
};

const useClasses = makeClasses({
  chip: {
    flexShrink: 0,
    padding: "0.2em",
    height: "auto",
    width: "auto",
    minWidth: "4em",
    marginLeft: "0.5rem",
  },
  name: {
    flex: "none",
    width: "-webkit-fill-available",
    textOverflow: "ellipsis",
    textWrap: "nowrap",
  },
  root: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 0.5rem",
  },
  tooltipTitle: {
    marginBottom: "0.2rem",
    color: colors.text.blue,
    fontSize: "1.3em",
    fontWeight: 600,
    textAlign: "center",
  },
});
