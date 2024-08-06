import fs from "fs/promises";
import path from "path";
import prettier from "prettier";
import chalk from "chalk";

const capitalize = (str: string, restLower = false) =>
  str[0].toUpperCase() + (restLower ? str.substring(1).toLocaleLowerCase() : str.substring(1));

/* -------------------------------------------------------------------------- */
/*                               FILE DEFINITONS                              */
/* -------------------------------------------------------------------------- */
interface FileDef {
  name: string;
  makeFile: () => Promise<string>;
}

const makeIndexDef = (fileDefs: FileDef[]) => {
  const imports = fileDefs.map((fileDef) => `export * from "./${fileDef.name}";`).join("\n");
  fileDefs.push({ name: "index", makeFile: async () => imports });
};

const dbFileDefs: FileDef[] = [
  {
    name: "types",
    makeFile: async () => {
      const fileNames = ["collections", "file-imports", "files", "tags"];
      const fileMap = await Promise.all(
        fileNames.map(async (fileName) => ({
          files: await parseExports(`${ROOT_PATH}/database/actions/${fileName}.ts`),
          fileName,
        }))
      );

      return `import * as db from "medior/database";\n\n
      ${fileMap
        .map(
          (fm) =>
            `/* ----------------------------- ${fm.fileName}.ts ----------------------------- */\n` +
            fm.files
              .map(
                (fn) =>
                  `export type ${capitalize(fn)}Input = Parameters<typeof db.${fn}>[0];\nexport type ${capitalize(fn)}Output = ReturnType<typeof db.${fn}>;`
              )
              .join("\n\n")
        )
        .join("\n\n")}`;
    },
  },
];

makeIndexDef(dbFileDefs);

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */
const ROOT_PATH = path.resolve("..");

const formatFile = (str: string): Promise<string> =>
  prettier.format(str, { parser: "typescript", printWidth: 100, tabWidth: 2, useTabs: false });

const createFiles = async (folder: string, fileDefs: FileDef[]) => {
  await fs.mkdir(folder, { recursive: true });

  for (const fileDef of fileDefs) {
    const filePath = path.resolve(folder, `${fileDef.name}.ts`);

    try {
      const file = await formatFile(await fileDef.makeFile());
      await fs.writeFile(filePath, file);
      console.log(chalk.green(`Created ${filePath}`));
    } catch (err) {
      console.error(chalk.red(`\n[ERROR] '${filePath}': ${err.message}\n\n${err.stack}\n`));
    }
  }
};

const parseExports: (filePath: string) => Promise<string[]> = async (filePath) => {
  const fileContent = await fs.readFile(filePath, { encoding: "utf-8" });

  const fnRegEx = "export\\s+(class|const|function|let)\\s+";
  const exportedFunctions = fileContent
    .match(new RegExp(`${fnRegEx}\\w+`, "g"))
    ?.map((match) => match.replace(new RegExp(fnRegEx), ""));

  if (!exportedFunctions) throw new Error(`No exported functions found in '${filePath}'`);
  return exportedFunctions;
};

(async () => {
  try {
    console.log(chalk.cyan("\nGenerating files..."));
    await createFiles(`${ROOT_PATH}/database/_generated`, dbFileDefs);

    console.log(chalk.green("\nDone!"));
  } catch (err) {
    console.error(chalk.red(err.message));
  }
})();
