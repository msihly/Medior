import { DB_PATH, DB_PORT, OUTPUT_DIR, SERVER_PORT, SOCKET_PORT } from "./env.js";

const env = { DB_PATH, DB_PORT, OUTPUT_DIR, SERVER_PORT, SOCKET_PORT };

export default env;
export type Env = typeof env;
