import { expect, it, vi } from "vitest";
import type { WAMessage, WASocket } from "baileys";
import {
  commandText,
  requestedVideo,
  verifiedSender,
} from "../src/video-input.js";
const request = (message: WAMessage["message"]): WAMessage => ({
  key: { id: "test", remoteJid: "628111111111@s.whatsapp.net" },
  message,
});
it("accepts caption and quoted video commands", () => {
  const direct = request({ videoMessage: { caption: " .S ", seconds: 2 } });
  expect(commandText(direct)).toBe(".s");
  expect(requestedVideo(direct)?.seconds).toBe(2);
  const reply = request({
    extendedTextMessage: {
      text: ".s",
      contextInfo: { quotedMessage: { videoMessage: { seconds: 3 } } },
    },
  });
  expect(requestedVideo(reply)?.seconds).toBe(3);
});
it("rejects view-once video including nested wrappers", () => {
  const video = { videoMessage: { viewOnce: true, caption: ".s" } };
  expect(requestedVideo(request(video))).toBeUndefined();
  const hidden = request({
    ephemeralMessage: { message: { viewOnceMessage: { message: video } } },
  });
  expect(commandText(hidden)).toBe("");
  expect(requestedVideo(hidden)).toBeUndefined();
});
it("uses trusted LID mapping and never infers a phone from LID digits", async () => {
  const lookup = vi.fn().mockResolvedValue(null);
  const socket = {
    signalRepository: { lidMapping: { getPNForLID: lookup } },
  } as unknown as WASocket;
  expect(await verifiedSender(socket, "123456789012@lid")).toBeUndefined();
  lookup.mockResolvedValue("628111111111@s.whatsapp.net");
  expect(await verifiedSender(socket, "123456789012@lid")).toBe("628111111111");
});
