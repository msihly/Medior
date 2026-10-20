import { socketEvents } from "medior/_generated/server/socket";
import { registerSocketProcess } from "trabecula/utils/process/socket";
import { getConfig, loadConfig } from "medior/utils/server";

registerSocketProcess(async () => {
  await loadConfig(process.env.CONFIG_PATH);

  return { events: socketEvents, port: getConfig().ports.socket };
});
