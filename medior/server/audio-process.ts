import type { InferenceSession } from "onnxruntime-node";
import type { Config } from "medior/utils/server/config";
import { registerNativeWorker } from "medior/utils/server/native-worker";

type AudioConfig = Config["file"]["similarity"]["audio"];

let ort: typeof import("onnxruntime-node");
let session: InferenceSession;
let sessionKey = "";

const getSession = async (config: AudioConfig, modelPath: string) => {
  const key = `${modelPath}:${config.device}`;

  if (session && sessionKey === key) return session;

  if (session) {
    await session.release();
    session = null;
    sessionKey = "";
  }

  ort ??= await import("onnxruntime-node");

  const loadSession = (device: AudioConfig["device"]) =>
    ort.InferenceSession.create(
      modelPath,
      device === "dml"
        ? { enableMemPattern: false, executionMode: "sequential", executionProviders: ["dml"] }
        : { executionProviders: ["cpu"] },
    );

  try {
    session = await loadSession(config.device);
  } catch (error) {
    if (config.device === "cpu") throw error;

    console.warn("Failed to initialize GPU audio embeddings. Falling back to CPU.", error);
    session = await loadSession("cpu");
  }

  sessionKey = key;

  return session;
};

registerNativeWorker(
  async (input: { chunks: Float32Array[]; config: AudioConfig; modelPath: string }) => {
    const encoder = await getSession(input.config, input.modelPath);
    const sampleCount = input.chunks[0].length;
    const waveform = new Float32Array(input.chunks.length * sampleCount);

    input.chunks.forEach((chunk, index) => waveform.set(chunk, index * sampleCount));

    const outputs = await encoder.run(
      { waveform: new ort.Tensor("float32", waveform, [input.chunks.length, sampleCount]) },
      [input.config.layer],
    );

    const tokens = outputs[input.config.layer];

    return { data: tokens.data as Float32Array, dims: tokens.dims };
  },
);
