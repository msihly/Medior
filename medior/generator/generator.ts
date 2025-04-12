import chalk from "chalk";
import { CLIENT_FILE_DEFS, SERVER_FILE_DEFS } from "medior/generator/file-defs";
import { createFiles, ROOT_PATH } from "medior/generator/utils";

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
