import { execFileSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { loadConfig } from "./config.js";
const i = process.argv.indexOf("--config");
const c = await loadConfig(i < 0 ? undefined : process.argv[i + 1]);
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw Error("Node.js 24 required");
const enc = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
  encoding: "utf8",
});
for (const name of ["libwebp_anim", "libopus"])
  if (!enc.includes(name)) throw Error(`Missing encoder ${name}`);
execFileSync("ffprobe", ["-version"]);
for (const dir of [
  dirname(c.storage.database_path),
  c.storage.session_path,
  c.storage.temp_path,
]) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await access(dir, constants.W_OK);
}
console.log("OK: runtime, configuration, FFmpeg encoders and storage");
