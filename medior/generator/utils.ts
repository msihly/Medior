import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { formatFile, makeIndexDef, makeSectionComment } from "trabecula/utils/generator";

export {
  formatFile,
  makeIndexDef,
  makeSectionComment,
  parseExports,
  parseExportsFromIndex,
} from "trabecula/utils/generator";

export const ROOT_PATH = path.resolve("./medior");

export const createFiles = async (folder: string, fileDefs: FileDef[]) => {
  await fs.mkdir(folder, { recursive: true });

  makeIndexDef(fileDefs);

  for (const fileDef of fileDefs) {
    const filePath = path.resolve(folder, `${fileDef.name}.ts`);

    try {
      const file = await formatFile(
        `${makeSectionComment("THIS IS A GENERATED FILE. DO NOT EDIT.")}\n${await fileDef.makeFile()}`,
      );

      let previous: string = null;

      try {
        previous = await fs.readFile(filePath, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      if (previous !== file) await fs.writeFile(filePath, file);

      console.log(chalk.green(`${previous === file ? "Unchanged" : "Created"} ${filePath}`));
    } catch (err) {
      console.error(chalk.red(`\n[ERROR] '${filePath}': ${err.message}\n\n${err.stack}\n`));

      throw err;
    }
  }
};
