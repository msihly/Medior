/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */
export type DiffParams = {
  aDetailer?: {
    cfgScale?: number;
    clipSkip?: number;
    confidence?: number;
    controlnetGuidanceEnd?: number;
    controlnetGuidanceStart?: number;
    controlnetModel?: string;
    controlnetModule?: string;
    controlnetWeight?: number;
    denoisingStrength?: number;
    dilateErode?: number;
    enabled?: boolean;
    inpaintHeight?: number;
    inpaintOnlyMasked?: boolean;
    inpaintPadding?: number;
    inpaintWidth?: number;
    maskBlur?: number;
    maskMaxRatio?: number;
    maskMergeInvert?: string;
    maskMinRatio?: number;
    maskOnlyTopKLargest?: number;
    model?: string;
    negPrompt?: string;
    noiseMultiplier?: number;
    prompt?: string;
    restoreFace?: boolean;
    sampler?: string;
    steps?: number;
    useCfgScale?: boolean;
    useClipSkip?: boolean;
    useInpaintWidthHeight?: boolean;
    useNoiseMultiplier?: boolean;
    useSampler?: boolean;
    useSteps?: boolean;
    xOffset?: number;
    yOffset?: number;
  };
  cfgScale?: number;
  clipSkip?: number;
  faceRestoration?: string;
  height?: number;
  hiresDenoisingStrength?: number;
  hiresScale?: number;
  hiresSteps?: number;
  hiresUpscaler?: string;
  isUpscaled?: boolean;
  model?: string;
  modelHash?: string;
  negPrompt?: string;
  negTemplate?: string;
  prompt?: string;
  rawParams?: string;
  sampler?: string;
  seed?: number;
  steps?: number;
  subseed?: number;
  subseedStrength?: number;
  template?: string;
  vae?: string;
  vaeHash?: string;
  width?: number;
};

/* -------------------------------------------------------------------------- */
/*                                  FUNCTIONS                                 */
/* -------------------------------------------------------------------------- */
export const parseDiffParam = <IsNum extends boolean>(
  diffParams: string,
  paramName: string,
  isNumber: IsNum,
  optional = false,
  endDelimiter = ",",
  startDelimeter = ": "
): IsNum extends true ? number : string => {
  try {
    const hasParam = diffParams.includes(`${paramName}: `);
    if (!hasParam) {
      if (!optional)
        throw new Error(`Param "${paramName}" not found in generation parameters: ${diffParams}.`);
      return undefined;
    }

    const rawParamUnterminated = diffParams.substring(
      diffParams.indexOf(`${paramName}${startDelimeter}`)
    );
    const startIndex = rawParamUnterminated.indexOf(startDelimeter) + startDelimeter.length;
    let endIndex = rawParamUnterminated.indexOf(endDelimiter, startIndex);
    if (!(endIndex > 0)) endIndex = undefined;

    const value = rawParamUnterminated
      .substring(startIndex, endIndex)
      ?.replace?.(/^(\s|\r)|(\s|\r)$/gim, "");
    if (isNumber) {
      if (isNaN(+value)) throw new Error(`Received NaN when parsing ${paramName}`);
      return +value as any;
    } else return value as any;
  } catch (err) {
    return undefined;
  }
};

export const parseDiffParams = (diffParams: string): DiffParams => {
  const negPromptEndIndex = diffParams.indexOf("Steps: ");
  let negPromptStartIndex = diffParams.indexOf("Negative prompt: ");
  if (negPromptStartIndex < 0) negPromptStartIndex = negPromptEndIndex;

  const prompt = diffParams.substring(0, negPromptStartIndex).replace(/(\n|\r)$/gim, "");
  const negPrompt = diffParams
    .substring(negPromptStartIndex, negPromptEndIndex)
    .replace(/(\n|\r)|Negative prompt:\s/gim, "");
  const restParams = diffParams.substring(negPromptEndIndex);

  const model = parseDiffParam(restParams, "Model", false);
  const modelHash = parseDiffParam(restParams, "Model hash", false);

  /* ------------------------------ Main Settings ----------------------------- */
  const cfgScale = parseDiffParam(restParams, "CFG scale", true);
  const clipSkip = parseDiffParam(restParams, "Clip skip", true, true);
  const hiresDenoisingStrength = parseDiffParam(restParams, "Hires denoising strength", true, true);
  const hiresScale = parseDiffParam(restParams, "Hires scale", true, true);
  const hiresSteps = parseDiffParam(restParams, "Hires steps", true, true);
  const hiresUpscaler = parseDiffParam(restParams, "Hires upscaler", false, true);
  const isUpscaled = hiresUpscaler !== undefined;

  const faceRestoration = parseDiffParam(restParams, "Face restoration", false, true);
  const sampler = parseDiffParam(restParams, "Sampler", false);
  const seed = parseDiffParam(restParams, "Seed", true);
  const steps = parseDiffParam(restParams, "Steps", true);
  const subseed = parseDiffParam(restParams, "Variation seed", true, true);
  const subseedStrength = parseDiffParam(restParams, "Variation seed strength", true, true);
  const vaeHash = parseDiffParam(restParams, '"vae"', false, true, '"', ': "') ?? "None";
  const [width, height] = parseDiffParam(restParams, "Size", false)
    .split("x")
    .map((d) => +d);

  /* ---------------------------- "ADetailer" Extension ---------------------------- */
  const aDetailer = {
    confidence: parseDiffParam(restParams, "ADetailer confidence", true, true),
    denoisingStrength: parseDiffParam(restParams, "ADetailer denoising strength", true, true),
    dilateErode: parseDiffParam(restParams, "ADetailer dilate/erode", true, true),
    enabled: true,
    inpaintOnlyMasked:
      parseDiffParam(restParams, "ADetailer inpaint only masked", false, true) !== "False",
    inpaintPadding: parseDiffParam(restParams, "ADetailer inpaint padding", true, true),
    maskBlur: parseDiffParam(restParams, "ADetailer mask blur", true, true),
    maskOnlyTopKLargest: parseDiffParam(
      restParams,
      "ADetailer mask_only_top_k_largest",
      true,
      true
    ),
    model: parseDiffParam(restParams, "ADetailer model", false, true),
  };

  /* ----------------------- "Dynamic Prompts" Extension ---------------------- */
  const template = parseDiffParam(restParams, "Template", false, true, "Negative Template");
  const negTemplate = parseDiffParam(restParams, "Negative Template", false, true, "\r");

  return {
    aDetailer,
    cfgScale,
    clipSkip,
    faceRestoration,
    height,
    hiresDenoisingStrength,
    hiresScale,
    hiresSteps,
    hiresUpscaler,
    isUpscaled,
    model,
    modelHash,
    negPrompt,
    negTemplate,
    prompt,
    rawParams: diffParams,
    sampler,
    seed,
    steps,
    subseed,
    subseedStrength,
    template,
    width,
    vaeHash,
  };
};
