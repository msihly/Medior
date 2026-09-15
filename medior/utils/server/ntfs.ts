import fs from "fs/promises";

export interface NtfsFileIdentity {
  fileId: string;
  volumeId: string;
}

export const getNtfsFileIdentity = async (filePath: string): Promise<NtfsFileIdentity> => {
  const stats = await fs.stat(filePath, { bigint: true });

  return { fileId: stats.ino.toString(), volumeId: stats.dev.toString() };
};
