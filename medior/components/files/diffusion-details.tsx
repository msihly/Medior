import { useMemo } from "react";
import { Comp, Detail, Text, UniformList, View } from "medior/components";
import { DiffusionParams, parseDiffusionParams } from "medior/utils/common";

export interface DiffusionDetailsProps {
  comfyPrompt: string;
}

const formatLora = ({ name, strengthClip, strengthModel }: DiffusionParams["loras"][number]) =>
  `${name}: model ${strengthModel ?? "--"}${strengthClip === undefined ? "" : `, clip ${strengthClip}`}`;

/** What ComfyUI generated a file with, from the prompt it saved into the file. */
export const DiffusionDetails = Comp(({ comfyPrompt }: DiffusionDetailsProps) => {
  const params = useMemo(
    () => (comfyPrompt ? parseDiffusionParams(comfyPrompt) : null),
    [comfyPrompt],
  );

  return params ? (
    <View column spacing="0.5rem">
      <Detail label="Positive Prompt" value={params.positivePrompt} whiteSpace="pre-wrap" />

      {!!params.negativePrompt && (
        <Detail label="Negative Prompt" value={params.negativePrompt} whiteSpace="pre-wrap" />
      )}

      <UniformList row spacing="1rem">
        <Detail label="Models" value={params.models.join("\n")} whiteSpace="pre-wrap" />

        <Detail label="VAE" value={params.vaes.join("\n")} whiteSpace="pre-wrap" />

        <Detail
          label="Text Encoders"
          value={params.textEncoders.join("\n")}
          whiteSpace="pre-wrap"
        />
      </UniformList>

      {params.loras.length > 0 && (
        <Detail
          label="LoRAs"
          value={params.loras.map(formatLora).join("\n")}
          whiteSpace="pre-wrap"
        />
      )}

      {params.samplers.map((sampler, index) => (
        <Detail
          key={`${index}-${sampler.title}`}
          label={sampler.title}
          value={
            <UniformList row spacing="1rem">
              {sampler.settings.map((setting, settingIndex) => (
                <Detail
                  key={`${settingIndex}-${setting.label}`}
                  label={setting.label}
                  value={String(setting.value)}
                />
              ))}
            </UniformList>
          }
        />
      ))}

      <Detail label="Upscaled?" value={params.isUpscaled ? "Yes" : "No"} />
    </View>
  ) : (
    <Text>{"Workflow only, without a prompt"}</Text>
  );
});
