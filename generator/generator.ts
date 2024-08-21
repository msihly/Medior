import chalk from "chalk";
import { fileDefs, storeFileDefs } from "./file-defs";
import { ROOT_PATH, createFiles } from "./utils";

(async () => {
  try {
    console.log(chalk.cyan("\nGenerating files..."));

    await createFiles(`${ROOT_PATH}/_generated`, fileDefs);
    await createFiles(`${ROOT_PATH}/store/_generated`, storeFileDefs);

    console.log(chalk.green("\nDone!"));
  } catch (err) {
    console.error(chalk.red(err.message));
  }
})();
