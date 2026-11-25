import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import lockfile from "proper-lockfile";
import { mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { replyFor } from "./commands.js";
import { commandText } from "./video-input.js";
import { Store } from "./store.js";
import { StickerService } from "./sticker-service.js";
import { assertSoundStickerSupport } from "./sticker-protocol.js";

const { values } = parseArgs({
  options: {
    config: { type: "string", default: "config.yaml" },
    pair: { type: "boolean", default: false },
    interactive: { type: "boolean", default: false },
  },
});
const config = await loadConfig(values.config);
assertSoundStickerSupport();
const logger = pino({ level: "info" });
if ((values.pair || values.interactive) && !process.stdout.isTTY) {
  throw Error("Jalankan pairing di terminal interaktif agar QR tetap privat.");
}
await mkdir(config.storage.session_path, { recursive: true, mode: 0o700 });
const lockPath = join(config.storage.session_path, ".running");
if (await stat(lockPath).catch(() => undefined)) {
  throw new Error(
    "Legacy .running lock found. Stop the old bot before removing that empty lock directory.",
  );
}
const releaseSession = await lockfile.lock(config.storage.session_path, {
  lockfilePath: join(config.storage.session_path, ".runtime-lock"),
  stale: 30000,
  update: 5000,
  retries: { retries: 8, minTimeout: 5000, maxTimeout: 5000 },
});
const healthPath = join(config.storage.session_path, "health.json");
await mkdir(dirname(config.storage.database_path), {
  recursive: true,
  mode: 0o700,
});
await mkdir(config.storage.temp_path, { recursive: true, mode: 0o700 });
for (const entry of await readdir(config.storage.temp_path, {
  withFileTypes: true,
})) {
  if (entry.isDirectory() && /^(download|encode)-/.test(entry.name)) {
    await rm(join(config.storage.temp_path, entry.name), {
      recursive: true,
      force: true,
    });
  }
}
const store = new Store(config.storage.database_path);
const stickers = new StickerService(config, store, logger);
const { state, saveCreds } = await useMultiFileAuthState(
  config.storage.session_path,
);
let socket: ReturnType<typeof makeWASocket> | undefined;
let stopping = false;
let connected = false;
let retries = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let credentials = Promise.resolve();
const seen = new Set<string>();
const heartbeat = setInterval(() => {
  void writeFile(
    healthPath,
    JSON.stringify({ connected, timestamp: Date.now() }),
  ).catch(() => logger.error("Health write failed"));
}, 5000);

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const forceExit = setTimeout(() => process.exit(code || 1), 10000);
  forceExit.unref();
  clearInterval(heartbeat);
  clearTimeout(reconnectTimer);
  await stickers.stop();
  socket?.end(undefined);
  await credentials.catch(() => {});
  await rm(healthPath, { force: true });
  await releaseSession();
  store.db.close();
  clearTimeout(forceExit);
  process.exitCode = code;
  setTimeout(() => process.exit(code), 500).unref();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

function connect() {
  if (stopping) return;
  logger.info("Connecting to WhatsApp...");
  const current = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  socket = current;
  current.ev.on("creds.update", () => {
    credentials = credentials.then(saveCreds).catch(() => {
      logger.error("Credential persistence failed");
      void shutdown(1);
    });
  });
  current.ev.on("connection.update", (update) => {
    if (current !== socket || stopping) return;
    if (update.qr) {
      if ((values.pair || values.interactive) && process.stdout.isTTY) {
        console.log(
          "Scan QR ini melalui WhatsApp > Perangkat tertaut. Jangan bagikan QR.",
        );
        qrcode.generate(update.qr, { small: true });
      } else {
        logger.error(
          "Pairing required. Run npm run pair in a private interactive terminal.",
        );
        void shutdown(1);
      }
    }
    if (update.connection === "open") {
      connected = true;
      retries = 0;
      logger.info("WhatsApp connected");
      if (values.pair) {
        credentials = credentials.then(saveCreds);
        void shutdown();
      } else {
        logger.info(
          "Bot siap diuji: kirim video dengan caption .s dari akun lain. Playback suara masih perlu diverifikasi.",
        );
      }
    }
    if (update.connection === "close") {
      connected = false;
      const error = update.lastDisconnect?.error as
        { output?: { statusCode?: number } } | undefined;
      if (error?.output?.statusCode === DisconnectReason.loggedOut) {
        logger.error("Session revoked; manual re-pairing required");
        void shutdown(1);
        return;
      }
      current.ev.removeAllListeners("messages.upsert");
      const delay =
        Math.min(60000, 1000 * 2 ** Math.min(retries++, 6)) +
        Math.random() * 1000;
      clearTimeout(reconnectTimer);
      logger.warn(
        {
          retryInSeconds: Math.ceil(delay / 1000),
          statusCode: error?.output?.statusCode,
        },
        "WhatsApp disconnected; reconnecting",
      );
      reconnectTimer = setTimeout(connect, delay);
    }
  });
  current.ev.on("messages.upsert", async ({ type, messages }) => {
    if (values.pair || stopping || type !== "notify") return;
    for (const message of messages) {
      const jid = message.key.remoteJid;
      if (
        !jid ||
        message.key.fromMe ||
        !message.key.id ||
        !(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"))
      )
        continue;
      const key = `${jid}:${message.key.id}`;
      if (seen.has(key)) continue;
      const text = commandText(message);
      if (text === ".s" || text === ".limit") {
        try {
          await stickers.handle(current, message);
        } catch {
          logger.error("Sticker command handler failed");
        }
        continue;
      }
      const reply = replyFor(text);
      if (!reply) continue;
      seen.add(key);
      if (seen.size > 10000) seen.delete(seen.values().next().value!);
      try {
        await current.sendMessage(jid, { text: reply }, { quoted: message });
        logger.info("Test command reply accepted by WhatsApp");
      } catch {
        logger.warn("Reply failed; no automatic resend");
      }
    }
  });
}
connect();
