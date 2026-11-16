import path from "path";
import { getKernel32, INVALID_HANDLE_VALUE, OPEN_EXISTING } from "medior/utils/server/kernel32";

const FILE_SHARE_READ = 0x1;
const FILE_SHARE_WRITE = 0x2;
const IOCTL_STORAGE_QUERY_PROPERTY = 0x2d1400;
const STORAGE_DEVICE_SEEK_PENALTY_PROPERTY = 7;

/** `\\?\Volume{GUID}\` and its terminator, the form Windows names every volume in. */
const VOLUME_NAME_LENGTH = 50;

const solidStateVolumes = new Map<string, boolean>();

const readWideString = (buffer: Buffer) => buffer.toString("utf16le").split("\0")[0];

const queryIsSolidState = (volumeName: string) => {
  const { closeHandle, createFile, deviceIoControl } = getKernel32();

  // Volumes open as devices without the trailing backslash, which would open their root folder.
  const handle = createFile(
    volumeName.replace(/\\$/, ""),
    0,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    null,
    OPEN_EXISTING,
    0,
    null,
  );
  if (handle === INVALID_HANDLE_VALUE) return false;

  try {
    // STORAGE_PROPERTY_QUERY: the property, then a standard query (0) and unused parameters.
    const query = Buffer.alloc(12);
    // DEVICE_SEEK_PENALTY_DESCRIPTOR: its version and size, then IncursSeekPenalty at byte 8.
    const descriptor = Buffer.alloc(12);
    const returned = Buffer.alloc(4);

    query.writeUInt32LE(STORAGE_DEVICE_SEEK_PENALTY_PROPERTY, 0);

    return (
      !!deviceIoControl(
        handle,
        IOCTL_STORAGE_QUERY_PROPERTY,
        query,
        query.length,
        descriptor,
        descriptor.length,
        returned,
        null,
      ) &&
      returned.readUInt32LE(0) > 8 &&
      descriptor[8] === 0
    );
  } finally {
    closeHandle(handle);
  }
};

/**
 * The volume holding a path, as `\\?\Volume{GUID}\`, which names a drive however it's mounted, or
 * null when Windows finds no local volume for it, such as for network shares.
 */
export const getVolumeName = (filePath: string) => {
  const { getVolumeNameForVolumeMountPoint, getVolumePathName } = getKernel32();

  const fullPath = path.resolve(filePath);

  // The mount point is the path or the start of it, with a trailing backslash and terminator.
  const mountPoint = Buffer.alloc((fullPath.length + 2) * 2);
  if (!getVolumePathName(fullPath, mountPoint, fullPath.length + 2)) return null;

  const volumeName = Buffer.alloc(VOLUME_NAME_LENGTH * 2);
  if (!getVolumeNameForVolumeMountPoint(readWideString(mountPoint), volumeName, VOLUME_NAME_LENGTH))
    return null;

  return readWideString(volumeName);
};

/**
 * Whether Windows reports a volume's drive as having no seek penalty, as solid-state drives do and
 * hard drives don't, the check its defragmenter makes. Volumes it can't report on, such as those
 * spanning several drives, count as hard drives. Querying a volume without reading it needs no
 * elevation.
 */
export const isSolidStateVolume = (volumeName: string) => {
  if (!solidStateVolumes.has(volumeName))
    solidStateVolumes.set(volumeName, queryIsSolidState(volumeName));

  return solidStateVolumes.get(volumeName);
};
