import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { WASocket, WAMessage } from "baileys";
import type { Logger } from "pino";
import type { AppConfig } from "./config.js";
import { convert } from "./media.js";
import { Store } from "./store.js";
import { JobQueue } from "./queue.js";
import {
  commandText,
  downloadVideo,
  requestedVideo,
  verifiedSender,
} from "./video-input.js";
import { prepareSoundSticker } from "./sticker-protocol.js";

function withDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Transport deadline exceeded")),
      milliseconds,
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

export class StickerService {
  private queue = new JobQueue();
  private stopping = false;
  private cancellation = new AbortController();

  constructor(
    private config: AppConfig,
    private store: Store,
    private logger: Logger,
  ) {}

  async handle(socket: WASocket, request: WAMessage): Promise<boolean> {
    const command = commandText(request);
    if (command !== ".s" && command !== ".limit") return false;
    const jid = request.key.remoteJid!;
    const reply = async (text: string) => {
      try {
        await withDeadline(
          socket.sendMessage(jid, { text }, { quoted: request }),
          15000,
        );
      } catch {
        this.logger.warn("Could not deliver status reply");
      }
    };
    if (this.stopping) return true;
    let sender: string | undefined;
    try {
      sender = await verifiedSender(socket, jid);
    } catch {
      /* Fail closed on unresolved identity. */
    }
    if (this.stopping) return true;
    if (!sender) {
      await reply(
        "Identitas nomor belum terverifikasi. Coba lagi setelah kontak tersinkron.",
      );
      return true;
    }
    if (command === ".limit") {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: this.config.quota.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const unlimited = this.config.quota.unlimited_numbers.includes(
        "+" + sender,
      );
      await reply(
        `${unlimited ? "Unlimited (batas resource tetap berlaku)." : `Pribadi: ${this.store.usage(sender, day).n}/${this.config.quota.per_user_daily ?? "tanpa batas"}.`}\nGlobal: ${this.store.global(day).n}/${this.config.quota.global_daily ?? "tanpa batas"}.\nTermasuk slot yang sedang diproses atau hasil kirim belum pasti. Reset pukul 00.00 ${this.config.quota.timezone}.`,
      );
      return true;
    }
    const video = requestedVideo(request);
    if (!video) {
      await reply(
        "Kirim video dengan caption .s, atau balas video dengan .s. Video sekali lihat tidak didukung.",
      );
      return true;
    }
    if (
      video.fileLength &&
      Number(video.fileLength) > this.config.media.max_input_bytes
    ) {
      await reply("Video terlalu besar. Batas input 20 MiB secara default.");
      return true;
    }
    if (!socket.user?.id || !request.key.id) return true;
    const key = createHash("sha256")
      .update(`${socket.user.id.split(":")[0]}|${jid}|${request.key.id}`)
      .digest("hex");
    if (this.store.has(key)) return true;
    if (!this.queue.hasCapacity) {
      await reply("Antrean penuh. Coba lagi nanti.");
      return true;
    }
    try {
      if (!this.store.admit(key, sender, this.config)) return true;
      this.queue.push(
        async () => {
          await this.process(socket, request, key, video, reply);
        },
        () => {
          this.store.transition(key, "reserved", "failed");
          if (!this.stopping)
            void reply("Waktu antre habis. Silakan kirim permintaan baru.");
        },
      );
    } catch (error) {
      this.store.transition(key, "reserved", "failed");
      const reason = error instanceof Error ? error.message : "";
      const allowed = [
        "Kuota pribadi habis.",
        "Kuota global habis.",
        "Masih ada permintaan Anda yang diproses.",
        "Antrean penuh. Coba lagi nanti.",
      ];
      await reply(
        allowed.includes(reason)
          ? reason
          : "Permintaan belum bisa diterima. Coba lagi nanti.",
      );
      return true;
    }
    await reply(
      "Video masuk antrean. Sedang disiapkan menjadi stiker bersuara.",
    );
    return true;
  }

  private async process(
    socket: WASocket,
    request: WAMessage,
    key: string,
    video: NonNullable<ReturnType<typeof requestedVideo>>,
    reply: (text: string) => Promise<void>,
  ) {
    let directory: string | undefined;
    let converted: Awaited<ReturnType<typeof convert>> | undefined;
    let sending = false;
    const started = Date.now();
    const signal = AbortSignal.any([
      this.cancellation.signal,
      AbortSignal.timeout(180000),
    ]);
    try {
      if (!this.store.transition(key, "reserved", "processing")) return;
      signal.throwIfAborted();
      directory = await mkdtemp(
        join(this.config.storage.temp_path, "download-"),
      );
      const input = join(directory, "input.mp4");
      await downloadVideo(
        video,
        input,
        this.config.media.max_input_bytes,
        signal,
      );
      converted = await convert(input, this.config, signal);
      signal.throwIfAborted();
      const outgoing = await prepareSoundSticker(socket, request, converted);
      signal.throwIfAborted();
      if (!this.store.transition(key, "processing", "sending"))
        throw new Error("Request state changed");
      sending = true;
      await withDeadline(
        socket.relayMessage(request.key.remoteJid!, outgoing.message!, {
          messageId: outgoing.key.id!,
        }),
        30000,
      );
      this.store.transition(key, "sending", "succeeded");
      this.logger.info(
        { requestId: key.slice(0, 12), durationMs: Date.now() - started },
        "Sound sticker accepted by transport; recipient playback requires verification",
      );
    } catch (error) {
      this.store.transition(
        key,
        sending ? "sending" : "processing",
        sending ? "unknown" : "failed",
      );
      this.logger.warn(
        {
          requestId: key.slice(0, 12),
          stage: sending ? "sending" : "processing",
        },
        "Sticker request failed",
      );
      if (!this.stopping) {
        const reason = error instanceof Error ? error.message : "";
        const safeErrors = [
          "Video terlalu besar.",
          "Video ini tidak memiliki audio.",
          "File tidak memiliki video.",
          "Durasi video tidak valid.",
          "Stiker masih terlalu besar. Gunakan video lebih sederhana.",
          "Output bukan stiker animasi.",
          "Audio terlalu besar.",
        ];
        await reply(
          sending
            ? "Status pengiriman belum pasti. Bot tidak mengirim ulang otomatis; slot kuota ditahan."
            : safeErrors.includes(reason)
              ? reason
              : "Video gagal diproses atau koneksi terputus. Kuota tidak terpakai. Coba video MP4 pendek dengan audio.",
        );
      }
    } finally {
      try {
        await converted?.cleanup();
        if (directory) await rm(directory, { recursive: true, force: true });
      } catch {
        this.logger.error(
          { requestId: key.slice(0, 12) },
          "Temporary media cleanup failed",
        );
      }
    }
  }

  async stop() {
    this.stopping = true;
    this.cancellation.abort();
    await this.queue.stop();
  }
}
