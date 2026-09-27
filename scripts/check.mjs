import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { generate } from "./build.mjs";
const root = new URL("../", import.meta.url);
async function files(dir) {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  return entries
    .filter((e) => e.name.endsWith(".mjs"))
    .map((e) => `${dir}${e.name}`);
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root.pathname,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`${command} failed`);
}
const sources = [
  ...(await files("src/")),
  ...(await files("scripts/")),
  ...(await files("test/")),
];
for (const file of sources) run(process.execPath, ["--check", file]);
run("npm", ["run", "format:check"]);
if (
  (await readFile(new URL("src/index.user.js", root), "utf8")) !==
  (await generate())
)
  throw new Error("Development bundle stale");
run("npm", ["run", "test"]);
