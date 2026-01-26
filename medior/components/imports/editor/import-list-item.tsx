import { ReactNode, useMemo, useState } from "react";
import { Divider } from "@mui/material";
import { TagSchema } from "medior/_generated/server";
import { ModelCreationData } from "mobx-keystone";
import type { ImportStatus } from "medior/server/database";
import {
  Chip,
  Comp,
  Detail,
  Icon,
  IconName,
  IdButton,
  IMPORT_STATUSES,
  TagRow,
  Text,
  Tooltip,
  TooltipProps,
  TooltipWrapper,
  UniformList,
  View,
} from "medior/components";
import { FileImport } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { Fmt, parseDiffParams } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const IMPORT_LIST_ITEM_HEIGHT = 30;

export interface ImportListItemProps {
  bgColor?: string;
  fileImport: ModelCreationData<FileImport>;
  noStatus?: boolean;
  style?: React.CSSProperties;
}

export const ImportListItem = Comp(
  ({ bgColor, fileImport, noStatus = false, style = {} }: ImportListItemProps) => {
    const { css } = useClasses(null);

    const [tags, setTags] = useState<TagSchema[]>([]);

    const parsedParams = useMemo(() => {
      if (!fileImport.diffusionParams) return null;
      return parseDiffParams(fileImport.diffusionParams);
    }, [fileImport.diffusionParams]);

    const handleOpen = async () => {
      try {
        const res = await trpc.listTag.mutate({ filter: { id: fileImport.tagIds } });
        setTags(res.data);
      } catch (err) {
        console.error(err);
        toast.error("Error loading tags");
      }
    };

    const statusMeta = IMPORT_STATUSES[fileImport.status as ImportStatus];

    return (
      <View key={fileImport.path} bgColor={bgColor} className={css.root} {...{ style }}>
        {!noStatus && statusMeta ? (
          <Tooltip
            title={
              <View column spacing="0.5rem">
                <Text color={statusMeta.color} fontWeight={500}>
                  {statusMeta.label}
                </Text>

                {fileImport?.errorMsg && <Text>{fileImport?.errorMsg}</Text>}

                {fileImport?.fileId && <IdButton value={fileImport?.fileId} />}
              </View>
            }
            borderColor={statusMeta.color}
          >
            <Icon name={statusMeta.icon} color={statusMeta.color} margins={{ right: "0.5rem" }} />
          </Tooltip>
        ) : null}

        <Text
          tooltip={fileImport.path}
          tooltipProps={{ enterDelay: 1000, flexShrink: "inherit" }}
          className={css.name}
        >
          {fileImport.name}
        </Text>

        <View row>
          {(fileImport.tagIds?.length > 0 || fileImport.tagsToUpsert?.length > 0) && (
            <TooltipChip
              icon="Label"
              label="Tags"
              onOpen={handleOpen}
              enterDelay={700}
              enterNextDelay={300}
            >
              <TagRow tags={[...tags, ...fileImport.tagsToUpsert]} padding={{ all: "0.5rem" }} />
            </TooltipChip>
          )}

          {fileImport.diffusionParams?.length > 0 && (
            <TooltipChip icon="Notes" label="Parsed Params">
              <View column>
                <Detail label="Positive Prompt" value={parsedParams?.prompt} />
                <Detail label="Negative Prompt" value={parsedParams?.negPrompt} />

                <UniformList row>
                  <Detail label="Model" value={parsedParams?.model} flex="300%" />
                  <Detail label="Model Hash" value={parsedParams?.modelHash} />
                  <Detail label="VAE" value={parsedParams?.vae} />
                  <Detail label="VAE Hash" value={parsedParams?.vaeHash} />
                </UniformList>

                <UniformList row>
                  <Detail label="Width" value={parsedParams?.width} />
                  <Detail label="Height" value={parsedParams?.height} />
                  <Detail label="Seed" value={parsedParams?.seed} />
                  <Detail label="Subseed" value={parsedParams?.subseed} />
                  <Detail label="Subseed Strength" value={parsedParams?.subseedStrength} />
                </UniformList>

                <UniformList row>
                  <Detail label="Steps" value={parsedParams?.steps} />
                  <Detail label="Sampler" value={parsedParams?.sampler} flex="200%" />
                  <Detail label="CFG Scale" value={parsedParams?.cfgScale} />
                  <Detail label="Clip Skip" value={parsedParams?.clipSkip} />
                </UniformList>

                <UniformList row>
                  <Detail label="Upscaled?" value={parsedParams?.isUpscaled ? "Yes" : "No"} />
                  <Detail label="Face Restoration" value={parsedParams?.faceRestoration} />
                  <Detail
                    label="ADetailer?"
                    value={parsedParams?.aDetailer?.enabled ? "Yes" : "No"}
                  />
                </UniformList>

                <UniformList row>
                  <Detail label="Hires Scale" value={parsedParams?.hiresScale} />
                  <Detail label="Hires Upscaler" value={parsedParams?.hiresUpscaler} flex="150%" />
                  <Detail
                    label="Hires Denoising Strength"
                    value={parsedParams?.hiresDenoisingStrength}
                  />
                  <Detail label="Hires Steps" value={parsedParams?.hiresSteps} />
                </UniformList>

                <Divider sx={{ margin: "0.5rem 0" }} />

                <Text
                  color={colors.custom.blue}
                  fontWeight={600}
                  fontSize="1.3em"
                  textAlign="center"
                >
                  {"Raw Params"}
                </Text>
                <Text>{fileImport.diffusionParams}</Text>
              </View>
            </TooltipChip>
          )}

          <Chip label={Fmt.bytes(fileImport.size)} className={css.chip} />

          <Chip label={fileImport.extension} className={css.chip} />
        </View>
      </View>
    );
  },
);

interface TooltipChipProps extends Partial<Omit<TooltipProps, "children">> {
  children: ReactNode | ReactNode[];
  icon: IconName;
  label: string;
}

const TooltipChip = ({ children, icon, label, ...tooltipProps }: TooltipChipProps) => {
  const { css } = useClasses({});

  return (
    <TooltipWrapper
      tooltip={
        <View column padding={{ all: "0.5rem", top: "0.2rem" }}>
          <Text className={css.tooltipTitle}>{label}</Text>
          {children}
        </View>
      }
      tooltipProps={{
        maxWidth: "40rem",
        minWidth: "15rem",
        placement: "left-start",
        ...tooltipProps,
      }}
    >
      <Chip {...{ icon, label }} bgColor={colors.custom.blue} className={css.chip} />
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
    color: colors.custom.blue,
    fontSize: "1.3em",
    fontWeight: 600,
    textAlign: "center",
  },
});
