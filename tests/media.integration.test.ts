import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convert, run } from "../src/media.js";
import { schema } from "../src/config.js";
let directory: string;
let input: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "stacia-media-"));
  input = join(directory, "video.mp4");
  await mkdir(join(directory, "work"));
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=240x320:rate=12",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "2",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    input,
  ]);
}, 30000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
function config() {
  return schema.parse({
    quota: {
      timezone: "Asia/Jakarta",
      per_user_daily: 10,
      global_daily: 200,
      unlimited_numbers: [],
    },
    media: {
      max_input_bytes: 20971520,
      max_duration_seconds: 1,
      sticker_max_bytes: 500000,
      audio_max_bytes: 262144,
    },
    storage: {
      database_path: "unused.sqlite",
      session_path: "unused-session",
      temp_path: join(directory, "work"),
    },
  });
}
it("converts and trims real video to animated WebP and synchronized mono Opus", async () => {
  const result = await convert(input, config());
  try {
    expect(result.duration).toBeCloseTo(1, 1);
    expect((await stat(result.webp)).size).toBeLessThanOrEqual(500000);
    const audio = JSON.parse(
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        result.audio,
      ]),
    );
    expect(audio.streams[0].codec_name).toBe("opus");
    expect(audio.streams[0].channels).toBe(1);
  } finally {
    await result.cleanup();
  }
  expect(await readdir(join(directory, "work"))).toEqual([]);
}, 30000);
it("rejects silent video without leaving media behind", async () => {
  const silent = join(directory, "silent.mp4");
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-an",
    "-c:v",
    "copy",
    silent,
  ]);
  await expect(convert(silent, config())).rejects.toThrow(
    "tidak memiliki audio",
  );
  expect(await readdir(join(directory, "work"))).toEqual([]);
});
it("honors cancellation before starting media processing", async () => {
  await expect(convert(input, config(), AbortSignal.abort())).rejects.toThrow(
    "cancelled",
  );
});
