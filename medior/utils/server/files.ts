import fs from "fs/promises";
import path from "path";

export const checkFileExists = async (path: string) => !!(await fs.stat(path).catch(() => false));

export type TreeNode = { children: TreeNode[]; name: string };

const createTreeNode = (dirPath: string, tree: TreeNode[]) => {
  const dirNames = path.normalize(dirPath).split(path.sep) as string[];
  const [rootDirName, ...remainingDirNames] = dirNames;
  const treeNode = tree.find((t) => t.name === rootDirName);
  if (!treeNode) tree.push({ name: rootDirName, children: [] });
  if (remainingDirNames.length > 0)
    createTreeNode(path.join(...remainingDirNames), (treeNode ?? tree[tree.length - 1]).children);
};

export const createTree = (paths: string[]): TreeNode[] =>
  paths.reduce((acc, cur) => (createTreeNode(cur, acc), acc), []);

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

export const makeFolder = async (path: string) => await fs.mkdir(path, { recursive: true });
