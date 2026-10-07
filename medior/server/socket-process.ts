import { createServer } from "http";
import { socketEvents } from "medior/_generated/server/socket";
import { Server } from "socket.io";
import { fileLog, setLogsPath } from "trabecula/utils/server";
import { checkServerShutdown, registerProcessLifecycle } from "medior/server/process-lifecycle";
import { getConfig, loadConfig } from "medior/utils/server";

let io: Server;

const createSocketServer = async () => {
  checkServerShutdown();

  const port = getConfig().ports.socket;
  const server = createServer();

  if (io) io.close();

  io = new Server(server);

  io.on("connection", (socket) => {
    socket.emit("connected");

    socketEvents.forEach((event) =>
      socket.on(event, (...args: any[]) => {
        socket.broadcast.emit(event, ...args);
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  fileLog(`[SOCKET] Listening on ${port}`);
};

registerProcessLifecycle({
  reload: async () => {
    await loadConfig(process.env.CONFIG_PATH);
  },

  start: async () => {
    await loadConfig(process.env.CONFIG_PATH);
    await setLogsPath(process.env.LOGS_PATH);
    await createSocketServer();
  },

  stop: async () => {
    if (io)
      await new Promise<void>((resolve, reject) =>
        io.close((error) => (error ? reject(error) : resolve())),
      );
  },
});

process.on("message", (message: any) => {
  if (message?.type === "emit" && io) io.emit(message.event, ...(message.args || []));
});
