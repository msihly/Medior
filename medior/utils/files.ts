// import * as fss from "fs";
import { promises as fs, constants as fsc } from "fs";
import path from "path";
import prettier from "prettier";
import { handleErrors, makePerfLog } from "medior/utils";

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export const copyFile = async (dirPath: string, originalPath: string, newPath: string) => {
  if (await checkFileExists(newPath)) return false;
  await fs.mkdir(dirPath, { recursive: true });

  await fs.copyFile(originalPath, newPath, fsc.COPYFILE_EXCL);
  return true;

  /*
  return new Promise(async (resolve, reject) => {
    try {
      const stats = await fs.stat(originalPath);
      const totalBytes = stats.size;

      const readStream = fss.createReadStream(originalPath);
      const writeStream = fss.createWriteStream(newPath, { flags: "wx" });

      let completedBytes = 0;
      const startTime = Date.now();

      const makeImportStats = (bytes: number) => {
        completedBytes += bytes;
        const elapsedTime = (Date.now() - startTime) / 1000;
        const rateInBytes = completedBytes / elapsedTime;
        const importStats = { completedBytes, elapsedTime, rateInBytes, totalBytes };
        trpc.emitImportStatsUpdated.mutate({ importStats });
      };

      const throttledMakeImportStats = throttle(makeImportStats, 1000);

      readStream.on("data", (chunk) => {
        throttledMakeImportStats(chunk.length);
      });

      readStream.on("end", () => {
        resolve(true);
      });

      readStream.on("error", (err) => {
        console.error("ReadStream error:", err);
        reject(err);
      });

      writeStream.on("error", (err) => {
        console.error("WriteStream error:", err);
        reject(err);
      });

      readStream.pipe(writeStream);
    } catch (err) {
      console.error("Error in promise:", err);
      reject(err);
    }
  });
  */
};

export const deleteFile = (path: string, copiedPath?: string) =>
  handleErrors(async () => {
    if (!(await checkFileExists(path)))
      return console.debug(`Failed to delete ${path}. File does not exist.`);
    if (copiedPath && !(await checkFileExists(copiedPath)))
      throw new Error(
        `Failed to delete ${path}. File does not exist at copied path ${copiedPath}.`
      );

    await fs.unlink(path);
  });

export const dirToFilePaths = async (
  dirPath: string,
  recursive: boolean = true,
  blacklistRegex?: RegExp
): Promise<string[]> => {
  const paths = await fs.readdir(dirPath, { withFileTypes: true });

  const filePaths = await Promise.all(
    paths.map(async (dirent) => {
      const filePath = path.join(dirPath, dirent.name);
      if (blacklistRegex?.test(filePath)) return [];
      if (dirent.isDirectory())
        return !recursive ? [] : await dirToFilePaths(filePath, recursive, blacklistRegex);
      return [filePath];
    })
  );

  return filePaths.flat();
};

export const dirToFolderPaths = async (dirPath: string): Promise<string[]> => {
  const paths = await fs.readdir(dirPath, { withFileTypes: true });

  const folderPaths = await Promise.all(
    paths.map(async (dirent) => {
      if (!dirent.isDirectory()) return [];
      const filePath = path.join(dirPath, dirent.name);
      return [filePath, ...(await dirToFolderPaths(filePath))];
    })
  );

  return folderPaths.flat();
};

export const extendFileName = (fileName: string, ext: string) =>
  `${path.relative(".", fileName).replace(/\.\w+$/, "")}.${ext}`;

export const formatFile = (str: string): Promise<string> =>
  prettier.format(str, { parser: "typescript", printWidth: 100, tabWidth: 2, useTabs: false });

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
  indexFilePath
) => {
  const indexContent = await fs.readFile(indexFilePath, { encoding: "utf-8" });

  const exportRegEx = /export\s+\*\s+from\s+"\.\/([\w-]+)";/g;
  const fileNames = [...indexContent.matchAll(exportRegEx)].map((match) => match[1]);

  const exportsMap = await Promise.all(
    fileNames.map((fileName) =>
      parseExports(path.join(path.dirname(indexFilePath), `${fileName}.ts`))
    )
  );

  return exportsMap.flat();
};

export const removeEmptyFolders = async (
  dirPath: string = ".",
  options: { excludedPaths?: string[] } = {}
) => {
  const DEBUG = false;
  const { perfLog, perfLogTotal } = makePerfLog("removeEmptyFolders");

  const dirPathsParts = [...new Set([dirPath, ...(await dirToFolderPaths(dirPath))])]
    .filter((p) => !options.excludedPaths?.includes(p))
    .map((p) => p.split(path.sep));
  if (DEBUG) perfLog("Got folder paths");

  const dirPathsDeepToShallow = [...dirPathsParts]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.join(path.sep));
  if (DEBUG) perfLog("Sorted folder paths");

  const emptyFolders = new Set<string>();
  await Promise.all(
    dirPathsDeepToShallow.map(async (dir) => {
      if ((await dirToFilePaths(dir)).length === 0) emptyFolders.add(dir);
    })
  );
  if (DEBUG) perfLog("Found empty folders");

  const rootDirsToEmpty = new Set<string>();
  for (const dir of dirPathsDeepToShallow) {
    if (emptyFolders.has(dir)) {
      const parts = dir.split(path.sep);
      parts.pop();
      const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join(path.sep));
      if (!ancestors.some((a) => emptyFolders.has(a))) rootDirsToEmpty.add(dir);
    }
  }
  if (DEBUG) perfLog("Found root folders to empty");

  await Promise.all([...rootDirsToEmpty].map((dir) => fs.rmdir(dir, { recursive: true })));
  if (DEBUG) perfLogTotal("Done");
};
