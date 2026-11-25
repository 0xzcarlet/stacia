import { parseArgs } from "node:util";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadConfig } from "./config.js";
import { convert } from "./media.js";
const { values } = parseArgs({
  options: {
    config: { type: "string", default: "config.yaml" },
    input: { type: "string" },
    "output-dir": { type: "string" },
  },
});
if (!values.input || !values["output-dir"])
  throw Error("Required: --input video.mp4 --output-dir directory");
const c = await loadConfig(values.config);
await mkdir(c.storage.temp_path, { recursive: true, mode: 0o700 });
const result = await convert(resolve(values.input), c);
try {
  await mkdir(values["output-dir"], { recursive: true });
  await copyFile(result.webp, join(values["output-dir"], "sticker.webp"));
  await copyFile(result.audio, join(values["output-dir"], "audio.ogg"));
  console.log(`Converted ${result.duration}s`);
} finally {
  await result.cleanup();
}
