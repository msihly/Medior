/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */
/** A node of the API prompt ComfyUI runs. Inputs hold literal values or links to another node's output. */
export interface ComfyNode {
  _meta?: { title?: string };
  class_type: string;
  inputs?: Record<string, unknown>;
}

/** The API prompt ComfyUI runs, with its nodes by ID. */
export type ComfyPrompt = Record<string, ComfyNode>;

/** A literal input value. Integers past JavaScript's precision, such as large seeds, keep their exact digits as text. */
export type ComfyValue = boolean | number | string;

export interface DiffusionParams {
  isUpscaled: boolean;
  loras: { name: string; strengthClip: ComfyValue; strengthModel: ComfyValue }[];
  /** Checkpoints and diffusion models the prompt loads. */
  models: string[];
  negativePrompt: string;
  positivePrompt: string;
  /** Sampling settings by the node that takes them, such as a sampler, noise, or scheduler node. */
  samplers: { settings: { label: string; value: ComfyValue }[]; title: string }[];
  textEncoders: string[];
  vaes: string[];
}

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */
/** Escapes of non-ASCII characters, as surrogate pairs or single units, among the text's other escapes. */
const ESCAPE = /\\(?:u(d[89ab][\da-f]{2})\\u(d[c-f][\da-f]{2})|u([\da-f]{4})|[^u])/gi;

/** Python's json.dumps writes bare NaN and Infinity. Strings are matched first so their text is left alone. */
const NON_FINITE_TOKEN = /"(?:\\.|[^"\\])*"|(?<![\w.-])(-?Infinity|NaN)(?![\w.])/g;

/** Core guiders that take positive conditioning in inputs other than positive, by their class. */
const POSITIVE_GUIDER_INPUTS = new Map([
  ["BasicGuider", ["conditioning"]],
  ["DualCFGGuider", ["cond1", "cond2"]],
]);

/** Inputs that core text encoders and string primitives hold prompt text in. */
const PROMPT_TEXT_INPUTS = new Set([
  "clip_g",
  "clip_l",
  "prompt",
  "t5xxl",
  "text",
  "text_g",
  "text_l",
  "value",
]);

/** Inputs that core samplers, noise, sampler, scheduler, and guider nodes take, in the order shown. */
const SAMPLER_SETTINGS: [input: string, label: string][] = [
  ["seed", "Seed"],
  ["noise_seed", "Seed"],
  ["steps", "Steps"],
  ["cfg", "CFG"],
  ["sampler_name", "Sampler"],
  ["scheduler", "Scheduler"],
  ["denoise", "Denoise"],
];

/* -------------------------------------------------------------------------- */
/*                                  FUNCTIONS                                 */
/* -------------------------------------------------------------------------- */
const isComfyValue = (value: unknown): value is ComfyValue =>
  ["boolean", "number", "string"].includes(typeof value);

/** A link to another node's output, as ComfyUI's graph_utils.is_link tells them apart from literals. */
const isLink = (value: unknown): value is [string, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  typeof value[1] === "number";

const reviveComfyValue = (_key: string, value: unknown, context?: { source?: string }) =>
  typeof value === "number" && !Number.isSafeInteger(value) && /^-?\d+$/.test(context?.source ?? "")
    ? context.source
    : value;

/** A JSON object ComfyUI wrote, reading bare NaN and Infinity as null as ComfyUI's frontend does, or null when the text holds none. */
const parseComfyObject = (text: string): Record<string, unknown> => {
  let value: unknown;

  try {
    value = JSON.parse(text, reviveComfyValue);
  } catch {
    try {
      value = JSON.parse(
        text.replace(NON_FINITE_TOKEN, (match, token) => (token ? "null" : match)),
        reviveComfyValue,
      );
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

/** A literal input, or the literal its linked node holds under the same name or as its value. */
const getLiteral = (prompt: ComfyPrompt, node: ComfyNode, input: string): ComfyValue => {
  const value = node.inputs?.[input];

  if (isComfyValue(value)) return value;
  else if (isLink(value)) {
    const source = prompt[value[0]]?.inputs;
    const linked = source?.[input] ?? source?.value;

    return isComfyValue(linked) ? linked : undefined;
  } else return undefined;
};

/** Each non-empty literal string the nodes hold in the inputs chosen, once each. */
const getInputStrings = (nodes: ComfyNode[], isInput: (input: string) => boolean) => [
  ...new Set(
    nodes.flatMap((node) =>
      Object.entries(node.inputs ?? {}).flatMap(([input, value]) =>
        isInput(input) && typeof value === "string" && value ? [value] : [],
      ),
    ),
  ),
];

/**
 * The text of the nodes found by following links upstream from each input of this kind, and from the inputs core guiders take positive conditioning in for the positive prompt.
 * Loaders hold no prompt text, a zeroed-out conditioning drops its text, and the other kind's inputs lead to the other prompt, so the walk stops at them.
 */
const getPromptText = (prompt: ComfyPrompt, kind: "negative" | "positive") => {
  const otherKind = kind === "positive" ? "negative" : "positive";
  const queue = Object.values(prompt)
    .flatMap((node) => [
      node.inputs?.[kind],
      ...(kind === "positive" ? (POSITIVE_GUIDER_INPUTS.get(node.class_type) ?? []) : []).map(
        (input) => node.inputs?.[input],
      ),
    ])
    .filter(isLink)
    .map(([nodeId]) => nodeId);
  const texts = new Set<string>();
  const visited = new Set<string>();

  while (queue.length) {
    const nodeId = queue.shift();
    const node = prompt[nodeId];

    if (
      node &&
      !visited.has(nodeId) &&
      !node.class_type.includes("Loader") &&
      node.class_type !== "ConditioningZeroOut"
    ) {
      visited.add(nodeId);

      for (const [input, value] of Object.entries(node.inputs ?? {})) {
        if (isLink(value)) {
          if (input !== otherKind) queue.push(value[0]);
        } else if (PROMPT_TEXT_INPUTS.has(input) && typeof value === "string" && value.trim())
          texts.add(value.trim());
      }
    }
  }

  return [...texts].join("\n\n");
};

/** A model's file name without the folders and extension ComfyUI lists it with. */
export const getComfyModelName = (value: string) =>
  value
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]*$/, "");

/** Whether ComfyUI saved a prompt or workflow, which stay together as they came from one file. */
export const hasComfyMetadata = (metadata: { comfyPrompt?: string; comfyWorkflow?: string }) =>
  Boolean(metadata?.comfyPrompt || metadata?.comfyWorkflow);

/**
 * The JSON text ComfyUI saved, or null when it isn't a JSON object.
 * Python's json.dumps escapes non-ASCII characters, which are written as themselves so searches match them.
 */
export const normalizeComfyJson = (text: string) => {
  if (!parseComfyObject(text)) return null;

  return text.trim().replace(ESCAPE, (sequence, high: string, low: string, unit: string) => {
    const code = unit ? parseInt(unit, 16) : null;

    if (high) return String.fromCharCode(parseInt(high, 16), parseInt(low, 16));
    else if (code >= 0x80 && (code < 0xd800 || code > 0xdfff)) return String.fromCharCode(code);
    else return sequence;
  });
};

/** What a ComfyUI API prompt generated the file with, or null when it can't be read. */
export const parseDiffusionParams = (comfyPrompt: string): DiffusionParams => {
  const parsed = parseComfyObject(comfyPrompt);
  if (!parsed) return null;

  const prompt: ComfyPrompt = Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, ComfyNode] =>
        typeof (entry[1] as ComfyNode)?.class_type === "string",
    ),
  );
  const nodes = Object.values(prompt);

  return {
    isUpscaled: nodes.some((node) => node.class_type.includes("Upscale")),
    loras: nodes.flatMap((node) =>
      typeof node.inputs?.lora_name === "string" && node.inputs.lora_name
        ? [
            {
              name: node.inputs.lora_name,
              strengthClip: getLiteral(prompt, node, "strength_clip"),
              strengthModel: getLiteral(prompt, node, "strength_model"),
            },
          ]
        : [],
    ),
    models: getInputStrings(nodes, (input) => input === "ckpt_name" || input === "unet_name"),
    negativePrompt: getPromptText(prompt, "negative"),
    positivePrompt: getPromptText(prompt, "positive"),
    samplers: nodes.flatMap((node) => {
      const settings = SAMPLER_SETTINGS.flatMap(([input, label]) => {
        const value = getLiteral(prompt, node, input);

        return value === undefined ? [] : [{ label, value }];
      });

      return settings.length ? [{ settings, title: node._meta?.title || node.class_type }] : [];
    }),
    textEncoders: getInputStrings(
      nodes.filter((node) => node.class_type !== "CLIPVisionLoader"),
      (input) => /^clip_name\d*$/.test(input),
    ),
    vaes: getInputStrings(nodes, (input) => input === "vae_name"),
  };
};
