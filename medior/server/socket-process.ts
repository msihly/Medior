import { socketEvents } from "medior/_generated/server/socket";
import { Server } from "socket.io";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { getConfig, loadConfig } from "medior/utils/server";

let io: Server;

const createSocketServer = async () => {
  const port = getConfig().ports.socket;

  if (io) io.close();
  io = new Server(port);

  io.on("connection", (socket) => {
    socket.emit("connected");

    socketEvents.forEach((event) =>
      socket.on(event, (...args: any[]) => {
        socket.broadcast.emit(event, ...args);
      }),
    );
  });

  fileLog(`[SOCKET] Listening on ${port}`);
};

process.on("message", async (msg: any) => {
  if (msg?.type === "start") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      await setLogsPath(process.env.LOGS_PATH);
      await createSocketServer();
      process.send?.({ requestId: msg.requestId, type: "ready" });
    } catch (err: any) {
      process.send?.({ error: err.message, requestId: msg.requestId, type: "error" }, () =>
        process.exit(1),
      );
    }
  }

  if (msg?.type === "reload-config") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      process.send?.({ requestId: msg.requestId, type: "config-reloaded" });
    } catch (err: any) {
      process.send?.({ error: err.message, requestId: msg.requestId, type: "error" });
    }
  }

  if (msg?.type === "emit" && io) {
    io.emit(msg.event, ...(msg.args || []));
  }
});
