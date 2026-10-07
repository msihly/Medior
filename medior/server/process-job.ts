import path from "path";
import { spawnSync, SpawnSyncOptionsWithBufferEncoding } from "child_process";

export const PROCESS_SHUTDOWN_TIMEOUT_MS = 30000;

let ownedJobHandle: number;

const runProcessJob = (command: string) => {
  const options: SpawnSyncOptionsWithBufferEncoding & { detached: boolean } = {
    detached: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
    timeout: 30000,
    windowsHide: true,
  };

  // The bootstrap transfers a non-inheritable job handle to this process, then exits.
  // Windows closes that handle on process death and terminates remaining descendants.
  // Isolate libuv's own child job; creating it before assigning this owner can invert nested jobs.
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const { execFileSync } = require("child_process");

try {
  process.stdout.write(execFileSync(process.argv[1], [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", process.argv[2]
  ], { stdio: "pipe", timeout: 25000, windowsHide: true }));
} catch (error) {
  process.stderr.write(String(error.stderr ?? error.message));
  process.exitCode = 1;
}`,
      path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      Buffer.from(
        `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class MediorProcessJob
{
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr sourceHandle,
        IntPtr targetProcess, out IntPtr targetHandle, uint access, bool inherit, uint options);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int informationClass,
        ref ExtendedLimits information, uint length);

    public static long Attach(int processId)
    {
        // PROCESS_TERMINATE | PROCESS_DUP_HANDLE | PROCESS_SET_QUOTA
        IntPtr owner = OpenProcess(0x141, false, processId);
        if (owner == IntPtr.Zero) throw new Win32Exception();

        IntPtr job = IntPtr.Zero;

        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new Win32Exception();

            ExtendedLimits limits = new ExtendedLimits();
            limits.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE

            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
                throw new Win32Exception();

            IntPtr ownedHandle;
            if (!DuplicateHandle(GetCurrentProcess(), job, owner, out ownedHandle, 0, false, 2))
                throw new Win32Exception();

            if (!AssignProcessToJobObject(job, owner)) throw new Win32Exception();

            return ownedHandle.ToInt64();
        }
        finally
        {
            if (job != IntPtr.Zero) CloseHandle(job);

            CloseHandle(owner);
        }
    }

    public static void ReleaseForRelaunch(int processId, long handle)
    {
        IntPtr owner = OpenProcess(0x40, false, processId); // PROCESS_DUP_HANDLE
        if (owner == IntPtr.Zero) throw new Win32Exception();

        IntPtr job = IntPtr.Zero;

        try
        {
            if (!DuplicateHandle(owner, new IntPtr(handle), GetCurrentProcess(), out job, 0, false, 2))
                throw new Win32Exception();

            ExtendedLimits limits = new ExtendedLimits();
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)))
                throw new Win32Exception();
        }
        finally
        {
            if (job != IntPtr.Zero) CloseHandle(job);

            CloseHandle(owner);
        }
    }
}
'@
[MediorProcessJob]::${command}`,
        "utf16le",
      ).toString("base64"),
    ],
    options,
  );

  if (result.error) throw result.error;

  if (result.status !== 0)
    throw new Error(`Windows process ownership failed: ${result.stderr.toString().trim()}`);

  return result.stdout;
};

/** Own descendants in the kernel, including when the owner cannot run an exit handler. */
export const ownProcessTree = () => {
  if (process.platform !== "win32" || ownedJobHandle) return;

  ownedJobHandle = Number(runProcessJob(`Attach(${process.pid})`).toString().trim());

  if (!Number.isSafeInteger(ownedJobHandle) || ownedJobHandle <= 0)
    throw new Error("Windows did not return the process ownership handle.");
};

/** Only after services stop, allow Electron's explicit relaunch helper to outlive the old app. */
export const releaseProcessTreeForRelaunch = () => {
  if (process.platform !== "win32") return;

  if (!ownedJobHandle) throw new Error("The application does not own its process tree.");

  runProcessJob(`ReleaseForRelaunch(${process.pid}, ${ownedJobHandle})`);
};
