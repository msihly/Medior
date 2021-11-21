import { createPool } from "mysql2/promise";
// const { DB_SERVER_NAME, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;

const DB_SERVER_NAME = "localhost";
const DB_USERNAME = "root";
const DB_PASSWORD = "Pvuy31dmunrq!";
const DB_NAME = "media-viewer";

const db = createPool({
  host: DB_SERVER_NAME,
  user: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
});

export default db;
export * from "./files";
export * from "./tags";
