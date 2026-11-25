import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
  type WASocket,
  type WAMessage,
} from "baileys";
import { readFile } from "node:fs/promises";

export type SoundSticker = proto.Message.IStickerMessage & {
  audioMessage?: proto.Message.IAudioMessage | null;
};

/** Verify the installed schema extension before opening a WhatsApp connection. */
export function assertSoundStickerSupport(): void {
  const sticker: SoundSticker = {
    isAnimated: true,
    audioMessage: { seconds: 2, mimetype: "audio/ogg; codecs=opus" },
  };
  const message = proto.Message.fromObject({ stickerMessage: sticker });
  const decoded = proto.Message.decode(proto.Message.encode(message).finish());
  const audio = (decoded.stickerMessage as SoundSticker | undefined)
    ?.audioMessage;
  if (audio?.seconds !== 2)
    throw new Error(
      "Audio sticker schema missing. Run npm run protocol:patch.",
    );
}

/** Uploads media only; the caller must persist `sending` before relaying the result. */
export async function prepareSoundSticker(
  socket: WASocket,
  request: WAMessage,
  files: {
    webp: string;
    audio: string;
    duration: number;
    waveform?: Uint8Array;
  },
) {
  const uploadOptions = {
    upload: socket.waUploadToServer,
    mediaUploadTimeoutMs: 30000,
  };
  const seconds = Math.max(1, Math.round(files.duration));
  const uploadedAudio = await prepareWAMessageMedia(
    {
      audio: await readFile(files.audio),
      mimetype: "audio/ogg; codecs=opus",
      seconds,
    },
    uploadOptions,
  );
  const uploadedSticker = await prepareWAMessageMedia(
    {
      sticker: await readFile(files.webp),
      isAnimated: true,
    },
    uploadOptions,
  );
  const audio = uploadedAudio.audioMessage;
  const sticker = uploadedSticker.stickerMessage;
  if (
    !audio?.mediaKey ||
    !audio.directPath ||
    !sticker?.mediaKey ||
    !sticker.directPath
  ) {
    throw new Error("Media upload returned incomplete metadata.");
  }
  const payload: SoundSticker = {
    ...sticker,
    width: 512,
    height: 512,
    isAnimated: true,
    audioMessage: {
      ...audio,
      mimetype: "audio/ogg; codecs=opus",
      seconds,
      ptt: true,
      waveform: files.waveform,
    },
  };
  const jid = request.key.remoteJid!;
  const userJid = jid.endsWith("@lid")
    ? (socket.user?.lid ?? socket.user?.id)
    : socket.user?.id;
  if (!userJid) throw new Error("WhatsApp disconnected before sending.");
  const result = generateWAMessageFromContent(
    jid,
    { stickerMessage: payload },
    { userJid, quoted: request },
  );
  const serialized = proto.Message.encode(result.message!).finish();
  const verified = proto.Message.decode(serialized)
    .stickerMessage as SoundSticker;
  if (!verified.audioMessage?.mediaKey)
    throw new Error("Audio metadata was lost during encoding.");
  return result;
}
