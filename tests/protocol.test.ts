import { expect, it } from "vitest";
import { generateWAMessageFromContent, proto } from "baileys";
import {
  assertSoundStickerSupport,
  type SoundSticker,
} from "../src/sticker-protocol.js";

it("preserves embedded audio through generation, encoding and object round trips", () => {
  assertSoundStickerSupport();
  const sticker: SoundSticker = {
    width: 512,
    height: 512,
    isAnimated: true,
    audioMessage: {
      seconds: 2,
      ptt: true,
      mediaKey: Buffer.alloc(32, 1),
      directPath: "/test/audio",
      mimetype: "audio/ogg; codecs=opus",
    },
  };
  const message = generateWAMessageFromContent(
    "628111111111@s.whatsapp.net",
    { stickerMessage: sticker },
    { userJid: "628222222222@s.whatsapp.net" },
  );
  const wire = proto.Message.encode(message.message!).finish();
  // Minimal fixture independently demonstrates field 26's wire tag (210 = d2 01).
  const fixture = proto.Message.StickerMessage.encode({
    audioMessage: { seconds: 2 },
  } as SoundSticker).finish();
  expect(Buffer.from(fixture).toString("hex")).toBe("d201022802");
  const decoded = proto.Message.decode(wire);
  const roundTrip = proto.Message.fromObject(proto.Message.toObject(decoded));
  const audio = (roundTrip.stickerMessage as SoundSticker).audioMessage!;
  expect(audio.seconds).toBe(2);
  expect(audio.ptt).toBe(true);
  expect(Buffer.from(audio.mediaKey!)).toEqual(Buffer.alloc(32, 1));
});
it("leaves ordinary stickers without an audio field", () => {
  const decoded = proto.Message.StickerMessage.decode(
    proto.Message.StickerMessage.encode({ isAnimated: true }).finish(),
  ) as SoundSticker;
  expect(decoded.audioMessage).toBeUndefined();
});
