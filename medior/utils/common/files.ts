export const isArchive = (filePath: string) => /\.(7z|rar|zip)$/.test(filePath);

export const isArchivePart = (filePath: string) =>
  /\.(part)?(?!0*1\b)\d+\.(7z|rar|zip)$/.test(filePath);

export const isArchiveFirstPart = (filePath: string) =>
  /\.(part)?(0*1\b)\.(7z|rar|zip)/.test(filePath);
