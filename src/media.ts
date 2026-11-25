import type { AppConfig } from "./config.js";
import { waveformFromPcm } from "./waveform.js";

interface ProbeStream {
  codec_type: string;
}
interface ProbeResult {
  streams: ProbeStream[];
  format: { duration: string };
}

import { spawn } from "node:child_process";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
export function run(
  binary: string,
  args: string[],
  timeout = 90000,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Processing cancelled"));
      return;
    }
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    function cancel(reason: string) {
      failure ??= new Error(reason);
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    }
    const onAbort = () => cancel("Processing cancelled");
    const timer = setTimeout(() => cancel("Media processing timeout"), timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    child.stdout.on("data", (chunk) => {
      if (stdout.length + chunk.length > 2000000)
        cancel("Probe output too large");
      else stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${binary}: ${stderr}`));
      else resolve(stdout);
    });
  });
}
export async function convert(
  input: string,
  config: AppConfig,
  signal?: AbortSignal,
) {
  if ((await stat(input)).size > config.media.max_input_bytes)
    throw Error("Video terlalu besar.");
  const deadline = Date.now() + 90000;
  const meta: ProbeResult = JSON.parse(
    await run(
      "ffprobe",
      [
        "-protocol_whitelist",
        "file,pipe",
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        input,
      ],
      Math.max(1, deadline - Date.now()),
      signal,
    ),
  );
  if (!meta.streams.some((stream) => stream.codec_type === "audio"))
    throw Error("Video ini tidak memiliki audio.");
  if (!meta.streams.some((stream) => stream.codec_type === "video"))
    throw Error("File tidak memiliki video.");
  const dir = await mkdtemp(join(config.storage.temp_path, "encode-"));
  try {
    const webp = join(dir, "sticker.webp"),
      audio = join(dir, "audio.ogg");
    const duration = Math.min(
      config.media.max_duration_seconds,
      Number(meta.format.duration),
    );
    if (!Number.isFinite(duration) || duration <= 0)
      throw Error("Durasi video tidak valid.");
    let valid = false;
    for (const [fps, quality] of [
      [12, 60],
      [12, 45],
      [10, 45],
      [8, 40],
      [6, 35],
      [6, 30],
    ]) {
      await run(
        "ffmpeg",
        [
          "-y",
          "-nostdin",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          input,
          "-map",
          "0:v:0",
          "-t",
          String(duration),
          "-an",
          "-vf",
          `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
          "-c:v",
          "libwebp_anim",
          "-threads",
          "1",
          "-quality",
          String(quality),
          "-loop",
          "0",
          webp,
        ],
        Math.max(1, deadline - Date.now()),
        signal,
      );
      if ((await stat(webp)).size <= config.media.sticker_max_bytes) {
        valid = true;
        break;
      }
    }
    if (!valid)
      throw Error("Stiker masih terlalu besar. Gunakan video lebih sederhana.");
    const animation = inspectAnimation(await readFile(webp));
    const ms = animation.durationMs;
    await run(
      "ffmpeg",
      [
        "-y",
        "-nostdin",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-vn",
        "-af",
        "aresample=async=1:first_pts=0,apad",
        "-t",
        String(ms / 1000),
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-ac",
        "1",
        audio,
      ],
      Math.max(1, deadline - Date.now()),
      signal,
    );
    if ((await stat(audio)).size > config.media.audio_max_bytes)
      throw Error("Audio terlalu besar.");
    const audioInfo = JSON.parse(
      await run(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", audio],
        Math.max(1, deadline - Date.now()),
        signal,
      ),
    ) as {
      streams: { codec_name: string; channels: number }[];
      format: { duration: string };
    };
    if (
      audioInfo.streams[0]?.codec_name !== "opus" ||
      audioInfo.streams[0]?.channels !== 1 ||
      !Number.isFinite(Number(audioInfo.format.duration)) ||
      Math.abs(Number(audioInfo.format.duration) - ms / 1000) > 0.1
    ) {
      throw new Error("Audio output format or timing invalid.");
    }
    const pcm = join(dir, "waveform.pcm");
    await run(
      "ffmpeg",
      [
        "-y",
        "-nostdin",
        "-v",
        "error",
        "-i",
        audio,
        "-t",
        String(ms / 1000),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "s16le",
        pcm,
      ],
      Math.max(1, deadline - Date.now()),
      signal,
    );
    const waveform = waveformFromPcm(await readFile(pcm));
    return {
      webp,
      audio,
      duration: ms / 1000,
      waveform,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}

function inspectAnimation(bytes: Buffer): {
  durationMs: number;
  frames: number;
} {
  let ms = 0,
    frames = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + size > bytes.length) throw Error("Invalid WebP");
    if (bytes.toString("ascii", offset, offset + 4) === "ANMF") {
      if (size < 16) throw Error("Invalid frame");
      ms += bytes.readUIntLE(offset + 20, 3);
      frames++;
    }
    offset += 8 + size + (size % 2);
  }
  if (frames < 2 || ms <= 0) throw Error("Output bukan stiker animasi.");
  return { durationMs: ms, frames };
}
