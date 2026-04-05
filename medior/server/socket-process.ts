import { socketEvents } from "medior/_generated/server/socket";
import { Server } from "socket.io";
import { getConfig, loadConfig } from "medior/utils/client";
import { fileLog, setLogsPath } from "medior/utils/server";

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

  fileLog(`Socket server listening on ${port}`);
};

process.on("message", async (msg: any) => {
  if (msg?.type === "start") {
    try {
      await loadConfig(process.env.CONFIG_PATH);
      await setLogsPath(process.env.LOGS_PATH);
      await createSocketServer();
      process.send?.({ type: "ready" });
    } catch (err: any) {
      process.send?.({ type: "error", error: err.message });
    }
  }

  if (msg?.type === "emit" && io) {
    io.emit(msg.event, ...(msg.args || []));
  }
});
