export const INVALID_HANDLE_VALUE = -1;
export const OPEN_EXISTING = 3;

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
    deviceIoControl: lib.func(
      "int __stdcall DeviceIoControl(intptr_t device, uint32_t code, void *input, uint32_t inputSize, void *output, uint32_t outputSize, void *returned, void *overlapped)",
    ) as (
      device: number,
      code: number,
      input: Buffer,
      inputSize: number,
      output: Buffer,
      outputSize: number,
      returned: Buffer,
      overlapped: null,
    ) => number,
    flushFileBuffers: lib.func("int __stdcall FlushFileBuffers(intptr_t handle)") as (
      handle: number,
    ) => number,
    getFileAttributes: lib.func("uint32_t __stdcall GetFileAttributesW(str16 name)") as (
      name: string,
    ) => number,
    getLastError: lib.func("uint32_t __stdcall GetLastError()") as () => number,
    getVolumeNameForVolumeMountPoint: lib.func(
      "int __stdcall GetVolumeNameForVolumeMountPointW(str16 mountPoint, void *volumeName, uint32_t length)",
    ) as (mountPoint: string, volumeName: Buffer, length: number) => number,
    getVolumePathName: lib.func(
      "int __stdcall GetVolumePathNameW(str16 fileName, void *volumePath, uint32_t length)",
    ) as (fileName: string, volumePath: Buffer, length: number) => number,
    moveFileEx: lib.func(
      "int __stdcall MoveFileExW(str16 existing, str16 updated, uint32_t flags)",
    ) as (existing: string, updated: string, flags: number) => number,
    setFileAttributes: lib.func(
      "int __stdcall SetFileAttributesW(str16 name, uint32_t attributes)",
    ) as (name: string, attributes: number) => number,
  };
};

export const getKernel32 = () => (kernel32 ??= loadKernel32());
