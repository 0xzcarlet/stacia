import {
  downloadContentFromMessage,
  type proto,
  type WAMessage,
  type WASocket,
} from "baileys";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export function visibleContent(
  message: proto.IMessage | null | undefined,
): proto.IMessage | undefined {
  let current = message;
  for (let depth = 0; current && depth < 5; depth++) {
    // Do not unwrap view-once content, even when it is inside an ephemeral wrapper.
    if (
      current.viewOnceMessage ||
      current.viewOnceMessageV2 ||
      current.viewOnceMessageV2Extension
    )
      return undefined;
    if (!current.ephemeralMessage) return current;
    current = current.ephemeralMessage.message;
  }
  return undefined;
}

export function commandText(message: WAMessage): string {
  const content = visibleContent(message.message);
  return (
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.videoMessage?.caption ??
    ""
  )
    .trim()
    .toLowerCase();
}

export function requestedVideo(
  message: WAMessage,
): proto.Message.IVideoMessage | undefined {
  const content = visibleContent(message.message);
  const quoted = visibleContent(
    content?.extendedTextMessage?.contextInfo?.quotedMessage,
  );
  const video = content?.videoMessage ?? quoted?.videoMessage;
  return video && !video.viewOnce ? video : undefined;
}

export async function verifiedSender(
  socket: WASocket,
  jid: string,
): Promise<string | undefined> {
  const phoneJid = jid.endsWith("@lid")
    ? await socket.signalRepository.lidMapping.getPNForLID(jid)
    : jid;
  const match = phoneJid?.match(/^([1-9]\d{7,14})(?::\d+)?@s\.whatsapp\.net$/);
  return match?.[1];
}

export async function downloadVideo(
  video: proto.Message.IVideoMessage,
  output: string,
  maxBytes: number,
  signal: AbortSignal,
) {
  if (video.fileLength && Number(video.fileLength) > maxBytes)
    throw new Error("Video terlalu besar.");
  const stream = await downloadContentFromMessage(video, "video", {
    options: { signal },
  });
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      callback(
        received > maxBytes ? new Error("Video terlalu besar.") : null,
        chunk,
      );
    },
  });
  await pipeline(
    stream,
    limiter,
    createWriteStream(output, { flags: "wx", mode: 0o600 }),
    { signal },
  );
  return received;
}
