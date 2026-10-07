import { createTRPCProxyClient, httpBatchLink, httpLink } from "@trpc/client";
import { SocketEmitEvent, SocketEmitEvents, SocketEvents } from "medior/_generated/server/socket";
import { io, Socket } from "socket.io-client";
import { fileLog } from "trabecula/utils/server";
import { ServerRouter } from "medior/server/trpc";
import type { VectorRouter } from "medior/server/vector-process";
import { getConfig } from "medior/utils/server/config";

/* -------------------------------------------------------------------------- */
/*                                    TRPC                                    */
/* -------------------------------------------------------------------------- */
export let trpc: ReturnType<typeof createTRPCProxyClient<ServerRouter>>;
export let vectorTrpc: ReturnType<typeof createTRPCProxyClient<VectorRouter>>;

export const setupTRPC = () => {
  // @ts-expect-error
  trpc = createTRPCProxyClient<ServerRouter>({
    links: [httpLink({ url: `http://127.0.0.1:${getConfig().ports.server}` })],
  });
};

export const setupVectorTRPC = () => {
  // @ts-expect-error
  vectorTrpc = createTRPCProxyClient<VectorRouter>({
    links: [httpBatchLink({ url: `http://127.0.0.1:${getConfig().ports.vector}` })],
  });
};

/* -------------------------------------------------------------------------- */
/*                                   SOCKETS                                  */
/* -------------------------------------------------------------------------- */
class SocketClass {
  private listeners: Array<{ event: keyof SocketEvents; listener: (...args: any[]) => void }> = [];
  private port: number;
  private socket: Socket;

  public constructor() {}

  public connect() {
    if (this.socket) return this.socket;

    try {
      this.port = getConfig().ports.socket;
      this.socket = io(`ws://127.0.0.1:${this.port}`);

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
    this.listeners = [];

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
    if (!this.socket) this.connect();

    try {
      setImmediate(() => {
        try {
          this.socket?.volatile.emit(event, ...args);
        } catch (err) {
          fileLog(`emit() inner error: ${err.message}`, { type: "error" });
        }
      });
    } catch (err) {
      fileLog(`emit() scheduleer error: ${err.message}`, { type: "error" });
    }
  }

  public emitReliable<Event extends SocketEmitEvent>(
    event: Event,
    ...args: Parameters<SocketEvents[Event]>
  ) {
    if (!this.socket) this.connect();

    try {
      this.socket.emit(event, ...args);
    } catch (err) {
      fileLog(`Reliable socket emit error: ${err.message}`, { type: "error" });
    }
  }

  public isConnected(): boolean {
    return !!this.socket?.connected;
  }

  public off<Event extends keyof SocketEvents>(
    event: Event,
    listener: (...args: any[]) => void,
  ): void {
    try {
      this.listeners = this.listeners.filter(
        (entry) => entry.event !== event || entry.listener !== listener,
      );
      // @ts-expect-error
      this.socket?.off(event, listener);
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
      this.listeners.push({ event, listener });
    } catch (err) {
      fileLog(err, { type: "error" });
    }
  }

  public reconnect() {
    const listeners = this.listeners;

    this.disconnect();
    this.connect();

    for (const { event, listener } of listeners) this.on(event, listener);
  }
}

export const socket = new SocketClass();

export const emitEvent = <E extends SocketEmitEvent>(
  event: E,
  data: Parameters<SocketEmitEvents[E]>[0],
) => trpc._emitEvent.mutate({ event, data });
