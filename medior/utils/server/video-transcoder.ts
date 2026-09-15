import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import { PassThrough } from "stream";

const BUFFER_AHEAD_SECONDS = 30;
const BUFFER_BEHIND_SECONDS = 10;
const MIME_TYPE = 'video/mp4; codecs="avc1.42C034"';
const STARTUP_TIMEOUT_MS = 30_000;

class TranscodeSession {
  private bufferErrorTimer: ReturnType<typeof setTimeout> | null = null;
  private command: FfmpegCommand;
  private currentTime = 0;
  private disposed = false;
  private firstFramesReceived = false;
  private getMediaElement: (() => HTMLMediaElement | null) | null = null;
  private hasBufferError = false;
  private mediaSource = new MediaSource();
  private mimeType = MIME_TYPE;
  private pendingChunk: Uint8Array | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private startupTimer: ReturnType<typeof setTimeout>;
  private stream = new PassThrough();
  private streamEnded = false;
  public readonly url = URL.createObjectURL(this.mediaSource);

  constructor(
    inputPath: string,
    videoBitrate: number,
    targetBitrateMbps: number,
    seekTime: number,
    private onFirstFrames?: () => void,
    private onError?: (error: Error) => void,
  ) {
    const bitrate = Math.max(0.5, targetBitrateMbps);
    this.command = ffmpeg()
      .input(inputPath)
      .seekInput(seekTime)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-map 0:V:0",
        "-map 0:a:0?",
        "-sn",
        "-dn",
        `-crf ${videoBitrate > 4_000_000 ? 24 : 18}`,
        `-b:v ${bitrate}M`,
        `-maxrate ${bitrate}M`,
        `-bufsize ${Math.max(1, bitrate * 2)}M`,
        "-preset ultrafast",
        "-tune zerolatency",
        "-profile:v baseline",
        "-level:v 5.2",
        "-threads 4",
        "-g 30",
        "-pix_fmt yuv420p",
        "-vf pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=PTS-STARTPTS",
        "-ac 2",
        "-ar 48000",
        "-profile:a aac_low",
        "-af aresample=async=1:first_pts=0",
        "-movflags frag_keyframe+empty_moov+default_base_moof",
        "-frag_duration 500000",
        "-flush_packets 1",
      ])
      .format("mp4")
      .on("start", () => {
        if (this.disposed) this.command.kill("SIGKILL");
      })
      .on("error", (error, _stdout, stderr) => {
        if (!this.disposed) {
          console.error("[Transcode] FFmpeg failed:", error, stderr);
          this.fail(error);
        }
      });

    this.stream.on("data", this.handleData);
    this.stream.on("end", this.handleEnd);
    this.stream.on("error", this.handleError);
    this.mediaSource.addEventListener("sourceopen", this.handleSourceOpen, { once: true });
    this.mediaSource.addEventListener("sourceclose", this.handleSourceClose);
    this.startupTimer = setTimeout(
      () => this.fail(new Error("Transcoding timed out before the video became playable.")),
      STARTUP_TIMEOUT_MS,
    );
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.startupTimer);
    if (this.bufferErrorTimer) clearTimeout(this.bufferErrorTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.mediaSource.removeEventListener("sourceopen", this.handleSourceOpen);
    this.mediaSource.removeEventListener("sourceclose", this.handleSourceClose);
    this.sourceBuffer?.removeEventListener("error", this.handleBufferError);
    this.sourceBuffer?.removeEventListener("updateend", this.pump);
    this.command.kill("SIGKILL");
    this.stream.removeListener("data", this.handleData);
    this.stream.removeListener("end", this.handleEnd);
    this.stream.destroy();
    this.pendingChunk = null;
    URL.revokeObjectURL(this.url);
  }

  public markReady() {
    clearTimeout(this.startupTimer);
  }

  public setMediaElementGetter(getElement: () => HTMLMediaElement | null) {
    this.getMediaElement = getElement;
  }

  public setCurrentTime(time: number) {
    if (!Number.isFinite(time) || time < 0 || this.disposed) return;
    this.currentTime = time;
    this.pump();
  }

  private fail(error: Error) {
    if (this.disposed) return;
    console.error("[Transcode]", error);
    this.dispose();
    this.onError?.(error);
  }

  private handleBufferError = () => {
    if (this.disposed || this.hasBufferError) return;
    this.hasBufferError = true;
    this.stream.pause();
    this.bufferErrorTimer = setTimeout(() => {
      const error = this.getMediaElement?.()?.error;
      this.fail(
        new Error(
          `The browser could not decode the transcoded video (${this.mimeType}). ${
            error
              ? `Media error ${error.code}: ${error.message}`
              : "No decoder details were provided."
          }`,
        ),
      );
    }, 250);
  };

  private handleData = (chunk: Buffer) => {
    this.stream.pause();
    this.pendingChunk = new Uint8Array(chunk);
    this.pump();
  };

  private handleEnd = () => {
    this.streamEnded = true;
    this.pump();
  };

  private handleError = (error: Error) => this.fail(error);

  private handleSourceClose = () =>
    this.fail(new Error("The transcoded video stream closed unexpectedly."));

  private handleSourceOpen = () => {
    if (this.disposed) return;
    this.command.ffprobe((error, metadata) => {
      if (this.disposed) return;
      if (error) return this.fail(error);
      try {
        this.mimeType = metadata.streams.some((stream) => stream.codec_type === "audio")
          ? 'video/mp4; codecs="avc1.42C034, mp4a.40.2"'
          : MIME_TYPE;
        if (!MediaSource.isTypeSupported(this.mimeType))
          throw new Error(`Transcoding format is not supported: ${this.mimeType}`);
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType);
        this.sourceBuffer.addEventListener("error", this.handleBufferError);
        this.sourceBuffer.addEventListener("updateend", this.pump);
        this.command.pipe(this.stream, { end: true });
      } catch (error) {
        this.fail(error as Error);
      }
    });
  };

  private pump = () => {
    if (
      this.disposed ||
      this.hasBufferError ||
      !this.sourceBuffer ||
      this.sourceBuffer.updating ||
      this.mediaSource.readyState !== "open"
    )
      return;

    try {
      if (!this.firstFramesReceived && this.sourceBuffer.buffered.length > 0) {
        this.firstFramesReceived = true;
        this.onFirstFrames?.();
        if (this.disposed) return;
      }

      if (this.sourceBuffer.buffered.length > 0) {
        if (this.sourceBuffer.buffered.start(0) < this.currentTime - BUFFER_BEHIND_SECONDS) {
          this.sourceBuffer.remove(0, this.currentTime - BUFFER_BEHIND_SECONDS);
          return;
        }
        if (
          this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1) -
            this.currentTime >=
          BUFFER_AHEAD_SECONDS
        )
          return;
      }

      if (this.pendingChunk) {
        this.sourceBuffer.appendBuffer(this.pendingChunk as BufferSource);
        this.pendingChunk = null;
      } else if (this.streamEnded) {
        if (!this.firstFramesReceived)
          throw new Error("FFmpeg finished without producing playable video frames.");
        this.mediaSource.endOfStream();
      } else this.stream.resume();
    } catch (error) {
      if ((error as Error).name !== "QuotaExceededError") this.fail(error as Error);
      else if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.pump();
        }, 250);
      }
    }
  };
}

class VideoTranscoder {
  private session: TranscodeSession | null = null;

  public dispose() {
    this.session?.dispose();
    this.session = null;
  }

  public markReady(url: string) {
    if (this.session?.url === url) this.session.markReady();
  }

  public setMediaElementGetter(url: string, getElement: () => HTMLMediaElement | null) {
    if (this.session?.url === url) this.session.setMediaElementGetter(getElement);
  }

  public setCurrentTime(time: number) {
    this.session?.setCurrentTime(time);
  }

  public transcode(
    inputPath: string,
    videoBitrate: number,
    targetBitrateMbps: number,
    seekTime = 0,
    onFirstFrames?: () => void,
    onError?: (error: Error) => void,
  ) {
    this.dispose();
    if (!MediaSource.isTypeSupported(MIME_TYPE))
      throw new Error(`Transcoding format is not supported: ${MIME_TYPE}`);
    this.session = new TranscodeSession(
      inputPath,
      videoBitrate,
      targetBitrateMbps,
      seekTime,
      onFirstFrames,
      onError,
    );
    return this.session.url;
  }
}

export const videoTranscoder = new VideoTranscoder();
