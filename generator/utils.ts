import fs from "fs/promises";
import chalk from "chalk";
import path from "path";
import { formatFile } from "medior/utils/files";

export const ROOT_PATH = path.resolve("./medior");

export const createFiles = async (folder: string, fileDefs: FileDef[]) => {
  await fs.mkdir(folder, { recursive: true });

  makeIndexDef(fileDefs);

  for (const fileDef of fileDefs) {
    const filePath = path.resolve(folder, `${fileDef.name}.ts`);

    try {
      const file = await formatFile(
        `/* -------------------------------------------------------------------------- */
        /*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
        /* -------------------------------------------------------------------------- */
        \n${await fileDef.makeFile()}`
      );
      await fs.writeFile(filePath, file);
      console.log(chalk.green(`Created ${filePath}`));
    } catch (err) {
      console.error(chalk.red(`\n[ERROR] '${filePath}': ${err.message}\n\n${err.stack}\n`));
    }
  }
};

export const makeIndexDef = (fileDefs: FileDef[]) => {
  const imports = fileDefs.map((fileDef) => `export * from "./${fileDef.name}";`).join("\n");
  fileDefs.push({ name: "index", makeFile: async () => imports });
};

export const makeSectionComment = (sectionName: string) =>
  `/* ${"-".repeat(75)} */\n/* ${" ".repeat(30)}${sectionName}\n/* ${"-".repeat(75)} */`;
