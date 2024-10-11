import { io, Socket } from "socket.io-client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { SocketEmitEvent, SocketEvents } from "../_generated/socket.js";
import { ServerRouter } from "../trpc.js";
import { getConfig } from "./config.js";
import { logToFile } from "./logging.js";

class SocketClass {
  private socket: Socket;
  private port: number;

  public constructor() {}

  public connect() {
    if (this.socket) return this.socket;

    try {
      this.port = getConfig().ports.socket;
      this.socket = io(`ws://localhost:${this.port}`);

      this.socket.on("connected", () =>
        logToFile("debug", `Socket.io connected on port ${this.port}. ID: ${this.socket.id}`)
      );

      this.socket.on("connect_error", (error) =>
        logToFile("error", `Socket.io error on port ${this.port}:`, error)
      );

      this.socket.on("disconnect", () =>
        logToFile("debug", `Socket.io disconnected on port ${this.port}.`)
      );
    } catch (err) {
      logToFile("error", "Failed to connect to socket.io", err);
    }

    return this.socket;
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      logToFile("debug", "Socket.io disconnected.");
    }
  }

  public emit<Event extends SocketEmitEvent>(
    event: Event,
    ...args: Parameters<SocketEvents[Event]>
  ) {
    try {
      if (!this.socket) this.connect();
      this.socket.emit(event, ...args);
    } catch (err) {
      logToFile("error", err);
    }
  }

  public isConnected(): boolean {
    return !!this.socket;
  }

  public off<Event extends keyof SocketEvents>(
    event: Event,
    listener: (...args: any[]) => void
  ): void {
    try {
      if (!this.socket) this.connect();
      // @ts-expect-error
      this.socket.off(event, listener);
    } catch (err) {
      logToFile("error", err);
    }
  }

  public on<Event extends keyof SocketEvents>(
    event: Event,
    listener: (...args: Parameters<SocketEvents[Event]>) => void
  ): void {
    try {
      if (!this.socket) this.connect();
      // @ts-expect-error
      this.socket.on(event, listener);
    } catch (err) {
      logToFile("error", err);
    }
  }
}

export const socket = new SocketClass();

export let trpc: ReturnType<typeof createTRPCProxyClient<ServerRouter>>;

export const setupTRPC = () => {
  // @ts-expect-error
  trpc = createTRPCProxyClient<ServerRouter>({
    links: [httpBatchLink({ url: `http://localhost:${getConfig().ports.server}` })],
  });
};
