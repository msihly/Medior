import fs from "fs/promises";

export interface NtfsFileIdentity {
  fileId: string;
  volumeId: string;
}

export const getNtfsFileIdentity = async (filePath: string): Promise<NtfsFileIdentity> => {
  const stats = await fs.stat(filePath, { bigint: true });

  return { fileId: stats.ino.toString(), volumeId: stats.dev.toString() };
};

/** The NTFS identity stored for a file's thumbnail, which orders files for disk-order reads. */
export const getThumbNtfsIdentity = <
  File extends { thumb?: { ntfsFileId?: string; ntfsVolumeId?: string } },
>(
  file?: File,
): Partial<NtfsFileIdentity> => ({
  fileId: file?.thumb?.ntfsFileId,
  volumeId: file?.thumb?.ntfsVolumeId,
});

const parseNtfsId = (value?: string) => {
  if (!value) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

/**
 * Orders items by volume, then NTFS file ID, from stored identities, so reading them one after
 * another keeps a hard drive from seeking without reading the disk to order them. Items without a
 * stored identity follow in their given order.
 */
export const sortByStoredNtfsIdentity = <T>(
  items: T[],
  getIdentity: (item: T) => Partial<NtfsFileIdentity>,
) =>
  items
    .map((item, index) => {
      const identity = getIdentity(item);
      const fileId = parseNtfsId(identity.fileId);
      const volumeId = parseNtfsId(identity.volumeId);

      return {
        index,
        item,
        key: fileId !== null && volumeId !== null ? { fileId, volumeId } : null,
      };
    })
    .sort((left, right) => {
      if (!left.key || !right.key)
        return !left.key === !right.key ? left.index - right.index : left.key ? -1 : 1;
      else if (left.key.volumeId !== right.key.volumeId)
        return left.key.volumeId < right.key.volumeId ? -1 : 1;
      else if (left.key.fileId !== right.key.fileId)
        return left.key.fileId < right.key.fileId ? -1 : 1;
      else return left.index - right.index;
    })
    .map(({ item }) => item);
