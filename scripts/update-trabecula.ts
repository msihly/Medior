import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const repoUrl = "https://github.com/msihly/trabecula.git";
const npmRepoUrl = "github:msihly/trabecula";
const branchFile = "update-trabecula.branch.txt";

const run = (command: string, args: string[], capture = false) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    });

    let stdout = "";

    child.stdout?.on("data", (data) => (stdout += data));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with code ${code}`)),
    );
  });

const getBranch = async () => {
  const branch =
    process.argv[2]?.trim() ||
    (await fs.readFile(path.resolve(__dirname, branchFile), "utf8")).trim();

  if (!branch) throw new Error(`Pass a branch or add one to ${branchFile}`);
  return branch;
};

const main = async () => {
  const branch = await getBranch();
  const output = await run("git", ["ls-remote", "--heads", repoUrl, branch], true);
  const commitHash = output.trim().split(/\s+/)[0];
  if (!commitHash) throw new Error(`Unable to find branch "${branch}"`);

  console.log(`Installing trabecula - ${branch} - ${commitHash}...`);
  await run("pnpm", ["install", `${npmRepoUrl}#${commitHash}`]);
  console.log("Install complete. Starting dev server...");
  await run("pnpm", ["run", "dev"]);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
