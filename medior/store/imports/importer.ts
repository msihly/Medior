import path from "path";
import md5File from "md5-file";
import * as models from "medior/_generated/server/models";
import type { ImportStatus } from "medior/server/database";
import {
  deleteFile,
  extendFileName,
  genFileInfo,
  getAvailableFileStorage,
  getIsRemuxable,
} from "medior/utils/client";
import { dayjs, handleErrors } from "medior/utils/common";
import { checkFileExists, fileLog, makePerfLog, remux, trpc } from "medior/utils/server";

const DEBUG = false;

let targetDir: string;
let targetDirBytesLeft: number;

export class FileImporter {
  private perfLog: (msg: string) => void;
  private perfLogTotal: (msg: string) => void;

  private dateCreated: string;
  private deleteOnImport: boolean;
  private diffParams: string;
  private ext: string;
  private file: models.FileSchema;
  private hash: string;
  private ignorePrevDeleted: boolean;
  private isDuplicate: boolean;
  private isPrevDeleted: boolean;
  private originalHash: string;
  private originalName: string;
  private originalPath: string;
  private size: number;
  private tagIds: string[];
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
    this.perfLog = (msg) => DEBUG && perf.perfLog(msg);
    this.perfLogTotal = (msg) => DEBUG && perf.perfLogTotal(msg);
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
      const res = await trpc.copyFile.mutate({
        dirPath: this.getDirPath(),
        originalPath: this.originalPath,
        newPath: this.getFilePath(),
      });
      if (!res.success) throw new Error(res.error);
      this.perfLog("Copied file");
    }

    if (this.deleteOnImport) await this.deleteOriginal();
  };

  private createFileSchema = async (file?: models.FileSchema) => {
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
    const deletedOriginal = await deleteFile(this.originalPath, this.getFilePath());
    if (deletedOriginal) this.perfLog("Deleted original file");
    else console.error("Failed to delete original file", this.originalPath);

    if (this.diffParams?.length > 0) {
      const deletedDiff = await deleteFile(extendFileName(this.originalPath, "txt"));
      if (deletedDiff) this.perfLog("Deleted diffusion params file");
    }

    const deletedSidecar = await deleteFile(extendFileName(this.originalPath, "json"));
    if (deletedSidecar) this.perfLog("Deleted sidecar file");
  };

  private getIsIgnored = () => {
    return this.isPrevDeleted && this.ignorePrevDeleted;
  };

  private getDirPath = () =>
    `${targetDir}\\${this.hash.substring(0, 2)}\\${this.hash.substring(2, 4)}`;

  private getFilePath = () => `${this.getDirPath()}\\${this.hash}.${this.ext}`;

  private hashFile = async (filePath: string) => {
    this.hash = await md5File(path.toNamespacedPath(filePath));
    this.perfLog(`Hashed file: ${this.hash}`);
  };

  private remux = async () => {
    const remuxed = await remux(this.originalPath, targetDir);
    if (this.deleteOnImport) await deleteFile(this.originalPath);
    this.perfLog(`Remuxed to MP4: ${remuxed.path}`);
    this.ext = "mp4";
    this.hash = remuxed.hash;
  };

  private setTargetDir = async () => {
    this.perfLog(`Available bytes: ${targetDirBytesLeft}. File bytes: ${this.size}.`);

    if (targetDirBytesLeft - 500000 > this.size) {
      this.perfLog(`Re-used target dir: ${targetDir}. Bytes left: ${targetDirBytesLeft}.`);
      return;
    }

    const res = await getAvailableFileStorage(this.size);
    if (!res.success) throw new Error(res.error);
    targetDir = res.data.location;
    targetDirBytesLeft = res.data.bytesLeft;
    this.perfLog(`Set target dir: ${targetDir}. Bytes left: ${targetDirBytesLeft}.`);
  };

  private updateDupeFile = async () => {
    const id = this.file.id;
    const res = await trpc.updateFile.mutate({ args: { id, updates: { ...this.file } } });
    if (!res.success) throw new Error(res.error);
    this.perfLog("Updated duplicate file");
  };

  /* ----------------------------------------------------------------------- */
  public import = async (): Promise<{
    error?: string;
    file?: models.FileSchema;
    status: ImportStatus;
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
      targetDirBytesLeft -= this.size;
    } catch (err) {
      if (err.code === "EEXIST") {
        await this.checkHash();
        if (this.isDuplicate) await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        this.perfLogTotal("Duplicate file imported.");
        fileLog(`Duplicate file: ${this.file.id}`);
        return { success: true, file: this.file, status: "DUPLICATE" };
      }
    }

    try {
      if (this.isDuplicate) {
        await this.updateDupeFile();
        if (this.deleteOnImport) await this.deleteOriginal();
        this.perfLogTotal("Duplicate file imported.");
        fileLog(`Duplicate file: ${this.file.id}`);
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
        fileLog(`Duplicate hash error: ${this.file.id}`);
        return { success: true, file: this.file, status: "DUPLICATE" };
      } else {
        this.perfLogTotal("Failed to import file.");
        console.error(`Error importing ${this.originalPath}:`, err.stack);
        return { success: false, error: err.message, status: "ERROR" };
      }
    }
  };

  public refresh = (file: models.FileSchema) =>
    handleErrors(async () => {
      this.file = file;
      this.hash = file.hash;
      this.originalPath = file.path;

      if (this.withRemux && getIsRemuxable(this.ext)) {
        this.deleteOnImport = true;
        await this.remux();
        await this.checkHash();

        if (this.isDuplicate) {
          const res = await trpc.updateFile.mutate({
            args: {
              id: this.file.id,
              updates: { ...this.file, hash: file.hash, isArchived: true },
            },
          });
          if (!res.success) throw new Error(res.error);
          return { success: true, status: "DUPLICATE" };
        }
      }

      this.file = {
        ...this.file,
        ...(await genFileInfo({ file, filePath: file.path, hash: this.hash })),
      };

      const res = await trpc.updateFile.mutate({
        args: { id: this.file.id, updates: { ...this.file } },
      });
      if (!res.success) throw new Error(res.error);
      this.perfLog("Refreshed file");
      return { success: true, status: "COMPLETE" };
    });
}
