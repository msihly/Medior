import chalk from "chalk";
import { SERVER_FILE_DEFS, CLIENT_FILE_DEFS } from "generator/file-defs";
import { ROOT_PATH, createFiles } from "generator/utils";

(async () => {
  try {
    console.log(chalk.cyan("\nGenerating files..."));
    await createFiles(`${ROOT_PATH}/_generated`, SERVER_FILE_DEFS);
    await createFiles(`${ROOT_PATH}/store/_generated`, CLIENT_FILE_DEFS);
    console.log(chalk.green("\nDone!"));
  } catch (err) {
    console.error(chalk.red(err.message));
  }
})();
