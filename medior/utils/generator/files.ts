import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import prettier from "prettier";

export const ROOT_PATH = path.resolve(".", "medior");

export const createFiles = async (folder: string, fileDefs: FileDef[]) => {
  try {
    await fs.mkdir(folder, { recursive: true });
    makeIndexDef(fileDefs);
  } catch (err) {
    console.error(err);
  }

  for (const fileDef of fileDefs) {
    try {
      const filePath = path.resolve(folder, `${fileDef.name}.ts`);

      const file = await formatFile(
        `${makeSectionComment("THIS IS A GENERATED FILE. DO NOT EDIT.")}\n${await fileDef.makeFile()}`,
      );
      await fs.writeFile(filePath, file);
      console.log(chalk.green(`Created ${filePath}`));
    } catch (err) {
      console.error(chalk.red(`\n[ERROR] '${fileDef.name}': ${err.message}\n\n${err.stack}\n`));
    }
  }
};

export const formatFile = (str: string): Promise<string> =>
  prettier.format(str, { parser: "typescript", printWidth: 100, tabWidth: 2, useTabs: false });

export const makeIndexDef = (fileDefs: FileDef[]) => {
  const imports = fileDefs.map((fileDef) => `export * from "./${fileDef.name}";`).join("\n");
  fileDefs.push({ name: "index", makeFile: async () => imports });
};

export const makeSectionComment = (sectionName: string) =>
  `/* ${"-".repeat(75)} */\n/* ${" ".repeat(30)}${sectionName}\n/* ${"-".repeat(75)} */`;

export const parseExports = async (filePath: string): Promise<string[]> => {
  const fileContent = await fs.readFile(filePath, { encoding: "utf-8" });
  const fnRegEx = /export\s+(class|const|function|let)\s+\w+/;
  const ignoreComment = "// @generator-ignore-export";

  const lines = fileContent.split("\n");
  const exportedFunctions: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(fnRegEx);
    if (match) {
      const prevLine = lines[i - 1]?.trim();
      if (prevLine !== ignoreComment) {
        exportedFunctions.push(match[0].replace(/export\s+(class|const|function|let)\s+/, ""));
      }
    }
  }

  if (exportedFunctions.length === 0)
    throw new Error(`No exported functions found in '${filePath}'`);
  return exportedFunctions;
};

export const parseExportsFromIndex: (indexFilePath: string) => Promise<string[]> = async (
  indexFilePath,
) => {
  const indexContent = await fs.readFile(indexFilePath, { encoding: "utf-8" });

  const exportRegEx = /export\s+\*\s+from\s+"\.\/([\w-]+)";/g;
  const fileNames = [...indexContent.matchAll(exportRegEx)].map((match) => match[1]);

  const exportsMap = await Promise.all(
    fileNames.map((fileName) =>
      parseExports(path.join(path.dirname(indexFilePath), `${fileName}.ts`)),
    ),
  );

  return exportsMap.flat();
};
