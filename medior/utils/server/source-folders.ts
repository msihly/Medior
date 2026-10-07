import path from "path";

export const getCommonSourceFolder = (filePaths: readonly string[], areFolders = false) => {
  let common: string[];
  let root: string;

  for (const filePath of filePaths) {
    if (!filePath) continue;

    const folder = areFolders ? filePath : path.win32.dirname(filePath);
    const folderRoot = path.win32.parse(folder).root;
    const parts = path.win32
      .relative(folderRoot, folder)
      .split(/[\\/]+/)
      .filter(Boolean);

    if (common === undefined) {
      common = parts;
      root = folderRoot;
    } else if (folderRoot.toLowerCase() !== root.toLowerCase()) {
      common = [];
      break;
    } else {
      let length = 0;

      while (
        length < common.length &&
        length < parts.length &&
        common[length].toLowerCase() === parts[length].toLowerCase()
      )
        length++;

      common.length = length;
    }
  }

  return common?.length ? path.win32.join(root, ...common) : null;
};
