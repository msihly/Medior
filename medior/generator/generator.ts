import chalk from "chalk";
import { SERVER_FILE_DEFS, STORE_FILE_DEFS } from "medior/generator/file-defs";
import { createFiles, ROOT_PATH } from "medior/generator/utils";

(async () => {
  try {
    console.log(chalk.cyan("\nGenerating files..."));
    await createFiles(`${ROOT_PATH}/_generated/server`, SERVER_FILE_DEFS, { skipUnchanged: true });
    await createFiles(`${ROOT_PATH}/store/_generated`, STORE_FILE_DEFS, { skipUnchanged: true });
    console.log(chalk.green("\nDone!"));
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exitCode = 1;
  }
})();
