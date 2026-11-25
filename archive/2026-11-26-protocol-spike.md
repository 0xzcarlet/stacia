> Historical snapshot archived on 2026-11-26. For current instructions, see [protocol and compatibility](../docs/protocol.md) and the [README](../README.md). Results below describe the initial implementation, not future revisions.

# Sound sticker protocol — local implementation and validation

Status: **offline implementation tested; live playback gate pending**. A successful
protobuf test or upload does not establish playback compatibility on a recipient.

## Mechanism

Baileys is pinned to `7.0.0-rc14`. Its installed `StickerMessage` has no embedded
audio field. `scripts/patch-baileys.mjs` adds field 26 (wire tag 210) to encoding,
decoding, fromObject and toObject. The patch checks both the exact package version
and original generated source SHA-256, and fails closed on unexpected changes.
`npm ci` runs it through postinstall. No runtime monkey-patching or shared audio
registry is used. The startup assertion detects a missing patch.

The protocol adapter separately uploads WebP with sticker/image context and
Ogg/Opus with audio context, preserves returned encryption metadata, and builds
an animated 512×512 sticker carrying AudioMessage metadata (`ptt`, duration and
64-sample waveform). The single outgoing message quotes the `.s` request.
There is no separate voice note and no silent-sticker fallback.

The independent minimal wire fixture for embedded audio with seconds=2 is
`d201022802`: field 26, two-byte payload, AudioMessage field 5, value 2.
Tests also cover Baileys message generation and object/encode/decode round trips.

References inspected:

- https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/main/src/whatsapp/send.js
- https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/main/src/sticker-audio-patch.js
- https://docs.baron0.com/WA_STICKERS/

The reference is MIT licensed; its attribution is retained in THIRD_PARTY_NOTICES.md.
Our implementation uses a version/hash-guarded generated schema extension instead
of the reference's runtime encoder wrapper.

## Reproduce the live spike

1. Build the local Docker image and run the interactive command in README.
2. Pair a dedicated account. Use a second account on a client with sound-sticker support.
3. Send a short MP4 with audible sound and caption `.s`; also reply `.s` to a video.
4. Confirm native sticker presentation, animation and audible playback on tap.
5. Check `.limit`; repeat after restarting the container without scanning again.
6. Record OS/client versions, dependency/image version, timestamp and observations
   here. Do not commit private chat exports, credential data or personal media.

Live send acceptance: pending.
Recipient Android/iOS and WhatsApp version: pending.
Native appearance / animation / sound: pending.
Unsupported-client fallback: not tested.

## Current limits

This is a local test milestone, not the completed PRD. Resource settings use one
worker, ten waiting jobs, a two-minute queue deadline, fixed bounded encode ladder,
and 90-second media conversion deadline. YAML does not yet expose all PRD fields.
Retention migrations, full auth-store hardening, revoked-session Docker lifecycle,
and VPS soak/load testing remain unfinished. Failed relay calls are conservatively
classified unknown, retaining admission-day quota and never automatically resending.

## Offline evidence (2026-11-26, Asia/Jakarta)

- 20 automated tests passed on the macOS host and Linux ARM64 Docker test image.
- Docker test run used `--memory=300m --cpus=1` with one Vitest worker.
- FFmpeg integration generated a real video, trimmed/encoded it, checked Opus mono,
  exercised silent-video rejection/cancellation, and verified temporary cleanup.
- Protocol fixture and object/encode/decode round trips passed.
- Mocked transport exercised success, pre-send failure, unknown send outcome,
  persistent duplicate suppression and quota settlement. No real outgoing message
  or playback is implied by these tests.
- Final runtime image built; Docker `doctor` passed against the mounted config/data.
- This does not constitute a VPS load test or completion of the live M0 gate.
