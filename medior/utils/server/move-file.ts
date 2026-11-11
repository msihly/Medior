import path from "path";

const DELETE = 0x00010000;
const ERROR_ALREADY_EXISTS = 183;
const ERROR_FILE_EXISTS = 80;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_NOT_SAME_DEVICE = 17;
const ERROR_PATH_NOT_FOUND = 3;
const FILE_ATTRIBUTE_NORMAL = 0x80;
const FILE_ATTRIBUTE_READONLY = 0x1;
const FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
const GENERIC_READ = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const INVALID_FILE_ATTRIBUTES = 0xffffffff;
const INVALID_HANDLE_VALUE = -1;
const OPEN_EXISTING = 3;

/** Without MOVEFILE_REPLACE_EXISTING or MOVEFILE_COPY_ALLOWED, a move never replaces or copies. */
const MOVEFILE_NO_REPLACE = 0;

/**
 * Archive, normal, not content indexed, compressed, and sparse: what an ordinary file has. Others,
 * such as hidden, system, encrypted, offline, or a reparse point or cloud placeholder, would follow
 * a moved file into storage, though a copy wouldn't have them. Read-only is cleared instead.
 */
const ORDINARY_ATTRIBUTES = 0x20 | 0x80 | 0x2000 | 0x800 | 0x200;

/** Without FILE_SHARE_* flags, the open fails while any other handle to the file is open. */
const SHARE_NONE = 0;

let kernel32: ReturnType<typeof loadKernel32> = null;

/** Koffi keeps each call's last Win32 error for the next call through Koffi to read. */
const loadKernel32 = () => {
  // Packaged apps reach node_modules via NODE_PATH, which require follows and import() doesn't.
  const { load }: typeof import("koffi") = require("koffi");
  const lib = load("kernel32.dll");

  return {
    closeHandle: lib.func("int __stdcall CloseHandle(intptr_t handle)") as (
      handle: number,
    ) => number,
    createFile: lib.func(
      "intptr_t __stdcall CreateFileW(str16 name, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t flags, void *template)",
    ) as (
      name: string,
      access: number,
      share: number,
      security: null,
      disposition: number,
      flags: number,
      template: null,
    ) => number,
    flushFileBuffers: lib.func("int __stdcall FlushFileBuffers(intptr_t handle)") as (
      handle: number,
    ) => number,
    getFileAttributes: lib.func("uint32_t __stdcall GetFileAttributesW(str16 name)") as (
      name: string,
    ) => number,
    getLastError: lib.func("uint32_t __stdcall GetLastError()") as () => number,
    moveFileEx: lib.func(
      "int __stdcall MoveFileExW(str16 existing, str16 updated, uint32_t flags)",
    ) as (existing: string, updated: string, flags: number) => number,
    setFileAttributes: lib.func(
      "int __stdcall SetFileAttributesW(str16 name, uint32_t attributes)",
    ) as (name: string, attributes: number) => number,
  };
};

/** Errors carry the codes `fs` would give: EEXIST, ENOENT, or EXDEV for another drive. */
const makeWin32Error = (message: string, code: number) => {
  const error: NodeJS.ErrnoException = new Error(`${message}: Windows error ${code}.`);

  if (code === ERROR_ALREADY_EXISTS || code === ERROR_FILE_EXISTS) error.code = "EEXIST";
  else if (code === ERROR_FILE_NOT_FOUND || code === ERROR_PATH_NOT_FOUND) error.code = "ENOENT";
  else if (code === ERROR_NOT_SAME_DEVICE) error.code = "EXDEV";

  return error;
};

/** The path as `fs` passes it to Windows, so long names and trailing dots or spaces match. */
const toWin32Path = (filePath: string) => path.toNamespacedPath(path.resolve(filePath));

/**
 * Renames a file within its drive without replacing a file at the destination, which `fs.rename`
 * would replace. Rejects with code EEXIST when the destination already exists, EXDEV when it is on
 * another drive, or ENOENT when the source or the destination's folder is missing, as `fs.link`
 * does.
 */
export const moveFileNoReplace = async (sourcePath: string, destinationPath: string) => {
  kernel32 ??= loadKernel32();

  const { getLastError, moveFileEx } = kernel32;

  if (!moveFileEx(toWin32Path(sourcePath), toWin32Path(destinationPath), MOVEFILE_NO_REPLACE))
    throw makeWin32Error(`Failed to move ${sourcePath} to ${destinationPath}`, getLastError());
};

/**
 * Moves an ordinary file like `moveFileNoReplace`, once it's shown that a moved file behaves like a
 * copy Medior wrote: it has only an ordinary file's attributes, and this process alone can open it
 * for reading, writing, and deleting, so no other program holds it. A read-only flag is cleared
 * first, as copies never have one. Writes still cached for the file are flushed, as a move doesn't
 * write them. A file that fails any of these stays in place with its flag restored.
 */
export const moveOrdinaryFileNoReplace = async (sourcePath: string, destinationPath: string) => {
  kernel32 ??= loadKernel32();

  const {
    closeHandle,
    createFile,
    flushFileBuffers,
    getFileAttributes,
    getLastError,
    setFileAttributes,
  } = kernel32;

  const source = toWin32Path(sourcePath);

  const attributes = getFileAttributes(source);
  if (attributes === INVALID_FILE_ATTRIBUTES)
    throw makeWin32Error(`Failed to read the attributes of ${sourcePath}`, getLastError());

  if (attributes & ~(ORDINARY_ATTRIBUTES | FILE_ATTRIBUTE_READONLY))
    throw new Error(`${sourcePath} has attributes 0x${attributes.toString(16)}, beyond a copy's.`);

  // Opening a read-only file for writing is refused, so the flag goes before the open below.
  const isReadOnly = (attributes & FILE_ATTRIBUTE_READONLY) !== 0;
  const writableAttributes = attributes & ~FILE_ATTRIBUTE_READONLY || FILE_ATTRIBUTE_NORMAL;

  if (isReadOnly && !setFileAttributes(source, writableAttributes))
    throw makeWin32Error(`Failed to clear the read-only flag of ${sourcePath}`, getLastError());

  try {
    const handle = createFile(
      source,
      GENERIC_READ | GENERIC_WRITE | DELETE,
      SHARE_NONE,
      null,
      OPEN_EXISTING,
      FILE_FLAG_OPEN_REPARSE_POINT,
      null,
    );

    if (handle === INVALID_HANDLE_VALUE)
      throw makeWin32Error(
        `Failed to open ${sourcePath} alone for changes, as it's open elsewhere or can't be changed`,
        getLastError(),
      );

    try {
      if (!flushFileBuffers(handle))
        throw makeWin32Error(`Failed to flush ${sourcePath}`, getLastError());
    } finally {
      closeHandle(handle);
    }

    await moveFileNoReplace(sourcePath, destinationPath);
  } catch (error) {
    // A failed move leaves the file at its source, where it gets its flag back.
    if (isReadOnly) setFileAttributes(source, attributes);

    throw error;
  }
};
