import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { SocketEmitEvent, SocketEvents } from "medior/_generated/socket";
import { io, Socket } from "socket.io-client";
import { ServerRouter } from "medior/server/trpc";
import { getConfig } from "medior/utils/client";
import { fileLog } from "medior/utils/server/logging";

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
        fileLog(`Socket.io connected on port ${this.port}. ID: ${this.socket.id}`),
      );

      this.socket.on("connect_error", (error) =>
        fileLog(`Socket.io error on port ${this.port}: ${error.message}`, { type: "error" }),
      );

      this.socket.on("disconnect", () => fileLog(`Socket.io disconnected on port ${this.port}.`));
    } catch (err) {
      fileLog(`Failed to connect to socket.io: ${err.message}`, { type: "error" });
    }

    return this.socket;
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      fileLog("Socket.io disconnected.");
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
      fileLog(err, { type: "error" });
    }
  }

  public isConnected(): boolean {
    return !!this.socket;
  }

  public off<Event extends keyof SocketEvents>(
    event: Event,
    listener: (...args: any[]) => void,
  ): void {
    try {
      if (!this.socket) this.connect();
      // @ts-expect-error
      this.socket.off(event, listener);
    } catch (err) {
      fileLog(err, { type: "error" });
    }
  }

  public on<Event extends keyof SocketEvents>(
    event: Event,
    listener: (...args: Parameters<SocketEvents[Event]>) => void,
  ): void {
    try {
      if (!this.socket) this.connect();
      // @ts-expect-error
      this.socket.on(event, listener);
    } catch (err) {
      fileLog(err, { type: "error" });
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
