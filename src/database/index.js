import { createPool } from "mysql2/promise";
import { DB_SERVER_NAME, DB_USERNAME, DB_PASSWORD, DB_NAME } from "env";

const db = createPool({
  host: DB_SERVER_NAME,
  user: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
});

export default db;
export * from "./files";
export * from "./tags";
