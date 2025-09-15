import fs from "fs/promises";
import path from "path";
import md5File from "md5-file";
import { FileSchema } from "medior/server/database";
import { FileImport, RootStore } from "medior/store";
import {
  checkFileExists,
  copyFile,
  deleteFile,
  extendFileName,
  genFileInfo,
  getAvailableFileStorage,
  getConfig,
  getIsRemuxable,
  toast,
} from "medior/utils/client";
import { dayjs, handleErrors } from "medior/utils/common";
import { dirToFilePaths, makePerfLog, remux, trpc } from "medior/utils/server";

export class FileImporter {
  private DEBUG = false;
  private perfLog: (msg: string) => void;
  private perfLogTotal: (msg: string) => void;

  private dateCreated: string;
  private deleteOnImport: boolean;
  private diffParams: string;
  private ext: string;
  private file: FileSchema;
  private hash: string;
  private ignorePrevDeleted: boolean;
  private isDuplicate: boolean;
  private isPrevDeleted: boolean;
  private originalHash: string;
  private originalName: string;
  private originalPath: string;
  private size: number;
  private tagIds: string[];
  private targetDir: string;
  private withRemux: boolean;

  constructor(args: {
    dateCreated?: string;
    deleteOnImport: boolean;
    ext: string;
    ignorePrevDeleted: boolean;
    originalName: string;
    originalPath: string;
    size: number;
    tagIds: string[];
    withRemux: boolean;
  }) {
    (this.dateCreated = args.dateCreated ?? dayjs().toISOString()),
      (this.deleteOnImport = args.deleteOnImport);
    this.ext = args.ext;
    this.ignorePrevDeleted = args.ignorePrevDeleted;
    this.originalName = args.originalName;
    this.originalPath = args.originalPath;
    this.size = args.size;
    this.tagIds = args.tagIds;
    this.withRemux = args.withRemux;

    const perf = makePerfLog("[FileImporter]");
    this.perfLog = (msg) => this.DEBUG && perf.perfLog(msg);
    this.perfLogTotal = (msg) => this.DEBUG && perf.perfLogTotal(msg);
  }

  private checkHash = async () => {
    const res = await trpc.checkFileImportHashes.mutate({ hash: this.hash });
    if (!res.success) throw new Error(res.error);
    this.file = res.data.file;
    this.isDuplicate = res.data.isDuplicate;
    this.isPrevDeleted = res.data.isPrevDeleted;
    this.perfLog(`isDuplicate: ${this.isDuplicate}, isPrevDeleted: ${this.isPrevDeleted}`);
  };

  private copyFile = async () => {
    const fileExistsAtPath = await checkFileExists(this.getFilePath());
    this.perfLog(`File exists at path: ${fileExistsAtPath}`);

    if (!fileExistsAtPath) {
      await copyFile(this.getDirPath(), this.originalPath, this.getFilePath());
      this.perfLog("Copied file");
    }

    if (this.deleteOnImport) await this.deleteOriginal();
  };

  private createFileSchema = async (file?: FileSchema) => {
    const res = await trpc.importFile.mutate({
      ...(await genFileInfo({ file, filePath: this.getFilePath(), hash: this.hash })),
      dateCreated: this.dateCreated,
      diffusionParams: this.diffParams,
      originalHash: this.originalHash,
      originalName: this.originalName,
      originalPath: this.originalPath,
      path: this.getFilePath(),
      size: this.size,
      tagIds: this.tagIds,
    });
    if (!res.success) throw new Error(res.error);
    this.perfLog("Imported file");
    return res.data;
  };

  private deleteOriginal = async () => {
    await deleteFile(this.originalPath, this.getFilePath());
    this.perfLog("Deleted original file");

    if (this.diffParams?.length > 0) {
      await deleteFile(extendFileName(this.originalPath, "txt"));
      this.perfLog("Deleted diffusion params file");
    }
  };

  private getIsIgnored = () => {
    return this.isPrevDeleted && this.ignorePrevDeleted;
  };

  private getDirPath = () =>
    `${this.targetDir}\\${this.hash.substring(0, 2)}\\${this.hash.substring(2, 4)}`;

  private getFilePath = () => `${this.getDirPath()}\\${this.hash}.${this.ext}`;

  private hashFile = async (filePath: string) => {
    this.hash = await md5File(path.toNamespacedPath(filePath));
    this.perfLog(`Hashed file: ${this.hash}`);
  };

  private remux = async () => {
    const remuxed = await remux(this.originalPath, this.targetDir);
    if (this.deleteOnImport) await deleteFile(this.originalPath);
    this.perfLog(`Remuxed to MP4: ${remuxed.path}`);
    this.ext = "mp4";
    this.hash = remuxed.hash;
  };

  private setTargetDir = async () => {
    const res = await getAvailableFileStorage(this.size);
    if (!res.success) throw new Error(res.error);
    this.targetDir = res.data;
    this.perfLog(`Set target dir: ${this.targetDir}`);
  };

  private updateDupeFile = async () => {
    const id = this.file.id;

    if (this.tagIds?.length > 0) {
      const res = await trpc.editFileTags.mutate({
        addedTagIds: this.tagIds,
        fileIds: [id],
        withSub: false,
      });
      if (!res.success) throw new Error(res.error);
      this.perfLog("Added tags to duplicate file");
    }

    const res = await trpc.updateFile.mutate({ id, ...this.file });
    if (!res.success) throw new Error(res.error);
    this.perfLog("Updated duplicate file");
  };

  /* ----------------------------------------------------------------------- */
  public import = async (): Promise<{
    error?: string;
    file?: FileSchema;
    status: FileImport["status"];
    success: boolean;
  }> => {
    try {
      await this.setTargetDir();
      await this.hashFile(this.originalPath);
      this.originalHash = this.hash;
    } catch (err) {
      this.perfLogTotal("Failed to import file.");
      console.error(`Error hashing ${this.originalPath}:`, err.stack);
      return { success: false, error: err.message, status: "ERROR" };
    }

    try {
      if (this.withRemux && getIsRemuxable(this.ext)) await this.remux();
      await this.checkHash();
    } catch (err) {
      this.perfLogTotal("Failed to import file.");
      console.error(`Error remuxing / checking hash ${this.originalPath}:`, err.stack);
      return { success: false, error: err.message, status: "ERROR" };
    }

    try {
      await this.copyFile();
    } catch (err) {
      if (err.code === "EEXIST") {
        await this.checkHash();
        if (this.isDuplicate) await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        this.perfLogTotal("Duplicate file imported.");
        return { success: true, file: this.file, status: "DUPLICATE" };
      }
    }

    try {
      if (this.isDuplicate) {
        await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        return { success: true, file: this.file, status: "DUPLICATE" };
      } else if (this.getIsIgnored()) {
        if (this.deleteOnImport) await this.deleteOriginal();
        return { success: true, status: "DELETED" };
      }

      this.file = await this.createFileSchema();
      this.perfLogTotal("New file imported.");
      return { success: true, file: this.file, status: "COMPLETE" };
    } catch (err) {
      if (err.message.includes("duplicate key")) {
        this.perfLogTotal("File imported with duplicate hash error.");
        return { success: true, file: this.file, status: "DUPLICATE" };
      } else {
        this.perfLogTotal("Failed to import file.");
        console.error(`Error importing ${this.originalPath}:`, err.stack);
        return { success: false, error: err.message, status: "ERROR" };
      }
    }
  };

  public refresh = (file: FileSchema) =>
    handleErrors(async () => {
      this.file = file;
      this.hash = file.hash;
      this.originalPath = file.path;
      await this.setTargetDir();

      if (this.withRemux && getIsRemuxable(this.ext)) {
        this.deleteOnImport = true;
        await this.remux();
        await this.checkHash();

        if (this.isDuplicate) {
          const res = await trpc.updateFile.mutate({
            ...this.file,
            hash: file.hash,
            isArchived: true,
          });
          if (!res.success) throw new Error(res.error);
          return { success: true, status: "DUPLICATE" };
        }
      }

      this.file = {
        ...this.file,
        ...(await genFileInfo({ file, filePath: this.getFilePath(), hash: this.hash })),
        path: this.getFilePath(),
      };

      const res = await trpc.updateFile.mutate(this.file);
      if (!res.success) throw new Error(res.error);
      this.perfLog("Refreshed file");
      return { success: true, status: "COMPLETE" };
    });
}

export const dirToFileImports = async (dirPath: string) => {
  const filePaths = await dirToFilePaths(dirPath);
  const imports = await filePathsToImports(filePaths);
  return { filePaths, imports };
};

export const filePathsToImports = async (filePaths: string[]) => {
  const config = getConfig();
  const validExts = new Set([...config.file.imageExts, ...config.file.videoExts]);

  return (
    await Promise.all(
      filePaths.map(async (filePath) => {
        const extension = path.extname(filePath).slice(1).toLowerCase();
        if (!validExts.has(extension)) return null;

        const stats = await fs.stat(filePath);
        return new FileImport({
          dateCreated: dayjs(
            Math.min(stats.birthtime.valueOf(), stats.ctime.valueOf(), stats.mtime.valueOf()),
          ).toISOString(),
          extension,
          name: path.parse(filePath).name,
          path: filePath,
          size: stats.size,
          status: "PENDING",
        });
      }),
    )
  ).filter((filePath) => filePath !== null);
};

export const handleIngest = async ({
  fileList,
  stores,
}: {
  fileList: FileList;
  stores: RootStore;
}) => {
  try {
    const { perfLog, perfLogTotal } = makePerfLog("[Ingest]");
    stores.import.editor.setIsInitDone(false);
    stores.import.editor.setIsOpen(true);

    const [filePaths, folderPaths] = [...fileList]
      .sort((a, b) => {
        const lengthDiff = a.path.split(path.sep).length - b.path.split(path.sep).length;
        if (lengthDiff !== 0) return lengthDiff;
        return a.name.localeCompare(b.name);
      })
      .reduce((acc, cur) => (acc[cur.type === "" ? 1 : 0].push(cur.path), acc), [
        [],
        [],
      ] as string[][]);

    const rootFolderPath = filePaths[0] ? path.dirname(filePaths[0]) : folderPaths[0];
    const initialRootIndex = rootFolderPath.split(path.sep).length - 1;
    stores.import.editor.setRootFolderPath(rootFolderPath);
    stores.import.editor.setRootFolderIndex(initialRootIndex);
    stores.import.editor.setFilePaths([]);
    stores.import.editor.setImports([]);
    perfLog("Init");

    const folders = await Promise.all(folderPaths.map(dirToFileImports));
    const importsFromFilePaths = await filePathsToImports(filePaths);

    const editorFilePaths = [...filePaths, ...folders.flatMap((f) => f.filePaths)];
    const editorImports = [...importsFromFilePaths, ...folders.flatMap((f) => f.imports)];
    perfLog("Created editor file paths and imports");

    stores.import.editor.setFilePaths(editorFilePaths);
    stores.import.editor.setImports(editorImports);
    perfLog("Re-render");

    perfLogTotal("Init done");
    setTimeout(() => stores.import.editor.setIsInitDone(true), 0);
  } catch (err) {
    toast.error("Error queuing imports");
    console.error(err);
  }
};
