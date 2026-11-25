import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// This reviewed schema extension is specific to the exact dependency in package-lock.json.
// No runtime monkey-patch or global message/hash registry is used.
const root = new URL("../node_modules/baileys/", import.meta.url);
const packageInfo = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
if (packageInfo.version !== "7.0.0-rc14") {
  throw new Error(
    "Review the sound-sticker schema patch before upgrading Baileys.",
  );
}
const path = new URL("WAProto/index.js", root);
let source = await readFile(path, "utf8");
const originalHash =
  "87c18c860e17ec66ecd5e1e5d4cf95a901bc4968d3318ad9238a66e20eee1684";
const additions = [
  [
    "StickerMessage.encode =",
    "                return w;",
    "                if (m.audioMessage != null)\n                    $root.proto.Message.AudioMessage.encode(m.audioMessage, w.uint32(210).fork()).ldelim();\n",
  ],
  [
    "StickerMessage.decode =",
    "                    default:",
    "                    case 26: {\n                        m.audioMessage = $root.proto.Message.AudioMessage.decode(r, r.uint32());\n                        break;\n                    }\n",
  ],
  [
    "StickerMessage.fromObject =",
    "                return m;",
    "                if (d.audioMessage != null)\n                    m.audioMessage = $root.proto.Message.AudioMessage.fromObject(d.audioMessage);\n",
  ],
  [
    "StickerMessage.toObject =",
    "                return d;",
    "                if (m.audioMessage != null)\n                    d.audioMessage = $root.proto.Message.AudioMessage.toObject(m.audioMessage, o);\n",
  ],
];
let clean = source;
for (const [, , addition] of additions) clean = clean.replace(addition, "");
if (createHash("sha256").update(clean).digest("hex") !== originalHash) {
  throw new Error("Unexpected Baileys protobuf source; refusing to patch.");
}
source = clean;
for (const [functionName, anchor, addition] of additions) {
  const start = source.indexOf(functionName);
  const position = source.indexOf(anchor, start);
  const end = source.indexOf("\n            };", start);
  if (start < 0 || position < start || position > end)
    throw new Error(`Missing patch anchor: ${functionName}`);
  source = source.slice(0, position) + addition + source.slice(position);
}
await writeFile(path, source);
console.log(
  "Baileys 7.0.0-rc14: reviewed sticker audio schema extension installed.",
);
