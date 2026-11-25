import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import type { WAMessage, WASocket } from "baileys";
import { schema } from "../src/config.js";
import { Store } from "../src/store.js";
import { StickerService } from "../src/sticker-service.js";

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  convert: vi.fn(),
  prepare: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock("../src/media.js", () => ({ convert: mocks.convert }));
vi.mock("../src/sticker-protocol.js", () => ({
  prepareSoundSticker: mocks.prepare,
}));
vi.mock("../src/video-input.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/video-input.js")>();
  return { ...original, downloadVideo: mocks.download };
});
let directory: string;
let store: Store;
let service: StickerService;
let socket: WASocket;
const request: WAMessage = {
  key: { id: "request-1", remoteJid: "628111111111@s.whatsapp.net" },
  message: { videoMessage: { caption: ".s" } },
};
beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), "stacia-test-"));
  const config = schema.parse({
    quota: {
      timezone: "Asia/Jakarta",
      per_user_daily: 10,
      global_daily: 200,
      unlimited_numbers: [],
    },
    media: {
      max_input_bytes: 20971520,
      max_duration_seconds: 5,
      sticker_max_bytes: 500000,
      audio_max_bytes: 262144,
    },
    storage: {
      database_path: join(directory, "test.sqlite"),
      session_path: join(directory, "session"),
      temp_path: directory,
    },
  });
  store = new Store(config.storage.database_path);
  service = new StickerService(config, store, pino({ level: "silent" }));
  socket = {
    user: { id: "628222222222:1@s.whatsapp.net" },
    sendMessage: vi.fn().mockResolvedValue({}),
    relayMessage: vi.fn().mockResolvedValue("sent"),
  } as unknown as WASocket;
  mocks.download.mockResolvedValue(100);
  mocks.convert.mockResolvedValue({
    webp: "test.webp",
    audio: "test.ogg",
    duration: 2,
    cleanup: mocks.cleanup,
  });
  mocks.prepare.mockResolvedValue({
    key: { id: "outgoing" },
    message: { stickerMessage: {} },
  });
});
afterEach(async () => {
  await service.stop();
  store.db.close();
  await rm(directory, { recursive: true, force: true });
});
const state = () =>
  (
    store.db.prepare("SELECT state FROM requests").get() as
      { state: string } | undefined
  )?.state;
it("settles successful conversion once and removes work directories", async () => {
  await service.handle(socket, request);
  await vi.waitFor(() => expect(state()).toBe("succeeded"));
  await service.handle(socket, request);
  expect(socket.relayMessage).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
  expect(
    (await readdir(directory)).some((name) => name.startsWith("download-")),
  ).toBe(false);
});
it("refunds conversion failure without attempting a send", async () => {
  mocks.convert.mockRejectedValue(new Error("Video ini tidak memiliki audio."));
  await service.handle(socket, request);
  await vi.waitFor(() => expect(state()).toBe("failed"));
  expect(socket.relayMessage).not.toHaveBeenCalled();
});
it("retains uncertain send outcomes and does not resend duplicates", async () => {
  vi.mocked(socket.relayMessage).mockRejectedValue(
    new Error("Connection lost"),
  );
  await service.handle(socket, request);
  await vi.waitFor(() => expect(state()).toBe("unknown"));
  await service.handle(socket, request);
  expect(socket.relayMessage).toHaveBeenCalledOnce();
});
