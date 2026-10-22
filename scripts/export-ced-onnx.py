"""Exports a CED audio encoder to ONNX for Medior's audio similarity search.

The graph takes 16 kHz mono waveforms shaped (batch, samples), up to 158,720 samples, and returns
two embedding outputs shaped (batch, tokens, dimensions), one token per 0.16 seconds:

  final   the encoder's last layer
  middle  the output of block 6 of 12, layer-normalized

Each token averages CED's four frequency patches for its 0.16 seconds. The mel spectrogram is part
of the graph, so Medior passes raw samples. The spectrogram is checked against CED's own feature
extractor and the exported model against PyTorch, deleting an export that does not match.

Requires PyTorch 2.5 or later:
  pip install torch torchaudio transformers onnx onnxruntime

Usage, with the Model Cache Path from Settings → Vectors:
  python scripts/export-ced-onnx.py --model ced-mini --cache "C:/path/to/ModelCache"

The model is written to <cache>/medior-audio/<model>.onnx, where Medior looks for it.
"""

import argparse
import os

import numpy as np
import onnxruntime
import torch
import torch.nn.functional as F
import torchaudio
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

CHUNK_SAMPLES = 62 * 2560
FREQUENCY_PATCHES = 4
HOP_LENGTH = 160
MIDDLE_BLOCK = 6
MODELS = ["ced-base", "ced-mini", "ced-small", "ced-tiny"]
N_FFT = 512
N_MELS = 64
SAMPLE_RATE = 16_000
TOP_DB = 120.0


class MelFrontEnd(torch.nn.Module):
    """CED's MelSpectrogram and AmplitudeToDB(top_db=120), computing the STFT with convolutions
    because ONNX export does not support the complex tensors torch.stft returns."""

    def __init__(self):
        super().__init__()

        window = torch.hann_window(N_FFT, periodic=True, dtype=torch.float64)
        frequencies = torch.arange(N_FFT // 2 + 1, dtype=torch.float64)[:, None]
        offsets = torch.arange(N_FFT, dtype=torch.float64)[None, :]
        angles = 2 * torch.pi * frequencies * offsets / N_FFT

        self.register_buffer("cos", (torch.cos(angles) * window).float()[:, None, :])
        self.register_buffer("sin", (torch.sin(angles) * window).float()[:, None, :])
        self.register_buffer(
            "mel",
            torchaudio.functional.melscale_fbanks(
                N_FFT // 2 + 1, 0.0, SAMPLE_RATE / 2, N_MELS, SAMPLE_RATE
            ),
        )

    def forward(self, waveform):
        padded = F.pad(waveform[:, None, :], (N_FFT // 2, N_FFT // 2), mode="reflect")
        power = F.conv1d(padded, self.cos, stride=HOP_LENGTH) ** 2
        power = power + F.conv1d(padded, self.sin, stride=HOP_LENGTH) ** 2

        mel = torch.matmul(power.transpose(1, 2), self.mel).transpose(1, 2)
        decibels = 10 * torch.log10(torch.clamp(mel, min=1e-10))

        return torch.maximum(decibels, decibels.amax(dim=(1, 2), keepdim=True) - TOP_DB)


class Encoder(torch.nn.Module):
    def __init__(self, model):
        super().__init__()

        self.embed_dim = model.config.embed_dim
        self.front_end = MelFrontEnd()
        self.middle_tokens = None
        self.model = model

        model.blocks[MIDDLE_BLOCK - 1].register_forward_hook(self.capture_middle_tokens)

    def capture_middle_tokens(self, _module, _inputs, output):
        self.middle_tokens = output

    @staticmethod
    def pool_frequencies(tokens):
        # CED flattens its (frequency, time) patch grid frequency-major, as its own "dm" pooling
        # unpacks it; 64 mel bands over a patch stride of 16 give four frequency rows.
        return tokens.reshape(tokens.shape[0], FREQUENCY_PATCHES, -1, tokens.shape[-1]).mean(dim=1)

    def forward(self, waveform):
        final = self.model(input_values=self.front_end(waveform)).logits
        # A constant size, rather than one read from the traced tensor's shape.
        middle = F.layer_norm(self.middle_tokens, (self.embed_dim,))

        return self.pool_frequencies(final), self.pool_frequencies(middle)


def check_front_end(encoder, extractor):
    audio = torch.randn(1, CHUNK_SAMPLES) * 0.1
    expected = extractor(audio[0].numpy(), sampling_rate=SAMPLE_RATE, return_tensors="pt")
    expected = expected["input_values"]

    with torch.no_grad():
        actual = encoder.front_end(audio)

    if actual.shape != expected.shape:
        raise SystemExit(
            f"Mel spectrogram shape {tuple(actual.shape)} differs from CED's {tuple(expected.shape)}."
        )

    error = (actual - expected).abs().max().item()

    if error > 1e-2:
        raise SystemExit(f"Mel spectrogram differs from CED's feature extractor by {error:.4f} dB.")

    print(f"Mel spectrogram matches CED's feature extractor within {error:.6f} dB.")


def check_export(encoder, output_path):
    session = onnxruntime.InferenceSession(output_path, providers=["CPUExecutionProvider"])

    # A full chunk and a short one, checking the dynamic batch and time axes.
    for batch_size, sample_count in ((2, CHUNK_SAMPLES), (1, 3 * 2560 + 100)):
        audio = torch.randn(batch_size, sample_count) * 0.1

        with torch.no_grad():
            expected = encoder(audio)

        actual = session.run(["final", "middle"], {"waveform": audio.numpy()})
        error = max(
            np.abs(tokens.numpy() - output).max() for tokens, output in zip(expected, actual)
        )

        if error > 1e-3:
            raise SystemExit(
                f"ONNX output differs from PyTorch by {error:.6f} for {sample_count} samples."
            )

        print(f"ONNX output shape {actual[0].shape} matches PyTorch within {error:.6f}.")


def main():
    parser = argparse.ArgumentParser(description="Export a CED audio encoder for Medior.")
    parser.add_argument("--cache", required=True, help="Medior's Model Cache Path.")
    parser.add_argument("--model", choices=MODELS, default="ced-mini")
    args = parser.parse_args()

    output_path = os.path.join(args.cache, "medior-audio", f"{args.model}.onnx")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    extractor = AutoFeatureExtractor.from_pretrained(f"mispeech/{args.model}", trust_remote_code=True)
    # The checkpoint is the audio tagger, whose encoder weights are stored under "encoder".
    classifier = AutoModelForAudioClassification.from_pretrained(
        f"mispeech/{args.model}", trust_remote_code=True
    )
    encoder = Encoder(classifier.encoder).eval()

    check_front_end(encoder, extractor)

    torch.onnx.export(
        encoder,
        (torch.randn(1, CHUNK_SAMPLES) * 0.1,),
        output_path,
        dynamic_axes={
            "final": {0: "batch", 1: "tokens"},
            "middle": {0: "batch", 1: "tokens"},
            "waveform": {0: "batch", 1: "samples"},
        },
        dynamo=False,
        input_names=["waveform"],
        opset_version=17,
        output_names=["final", "middle"],
    )

    try:
        check_export(encoder, output_path)
    except SystemExit:
        os.remove(output_path)
        raise

    print(f"Exported {args.model} to {output_path}.")


if __name__ == "__main__":
    main()
