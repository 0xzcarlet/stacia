# Sound sticker protocol and compatibility

[Back to README](../README.md)

**Status: offline validation passed; live playback remains unverified.** Protocol serialization tests and media uploads cannot establish recipient compatibility on their own.

## Message format

The adapter uploads the animated WebP using sticker/image media context and the Ogg/Opus clip using audio media context. It builds one 512 × 512 animated `StickerMessage` containing an `AudioMessage` in field 26, preserving the uploaded encryption metadata.

The embedded audio includes duration, `ptt`, and a 64-sample waveform. The outgoing sticker quotes the request. There is no additional voice-note message and no silent-sticker fallback.

## Version-specific schema extension

Baileys is pinned to `7.0.0-rc14`. Its installed generated schema lacks the embedded audio field. [`scripts/patch-baileys.mjs`](../scripts/patch-baileys.mjs) adds support to encoding, decoding, `fromObject`, and `toObject`.

The patch checks the exact dependency version and original source SHA-256 before applying changes. It runs through `postinstall` during `npm ci`; startup also checks that audio survives serialization. A dependency upgrade requires reviewing this extension rather than bypassing its checks.

No runtime encoder replacement or shared audio registry is used.

## Automated coverage

[`tests/protocol.test.ts`](../tests/protocol.test.ts) checks Baileys message generation and object/encode/decode round trips. The minimal independent wire fixture for embedded audio with `seconds = 2` is:

```text
d2 01 02 28 02
```

This represents sticker field 26, a two-byte audio payload, and audio field 5 with value 2. Other tests cover synthetic FFmpeg conversion, command parsing, identity mapping, quotas, queue limits, and success/failure settlement using mocked transport.

The [archived validation record](../archive/2026-11-26-protocol-spike.md) records the initial local/container checks. Run `npm test` for the current code; historical results are not a substitute for a fresh test after changes.

## Live validation

1. Follow the [Docker quick start](../README.md#quick-start-with-docker) and pair a dedicated bot account.
2. From a second account, send a short MP4 with audible sound and caption `.s`.
3. Repeat by replying `.s` to an existing video.
4. Verify native sticker appearance, animation, and audible playback on tap.
5. Check `.limit`, restart the bot, and verify the session and quota persist.
6. Record dependency/image versions, recipient OS and WhatsApp versions, date, and observations. Keep personal media and credentials out of the repository.

| Check                                        | Recorded status |
| -------------------------------------------- | --------------- |
| Live transport acceptance of a sound sticker | Pending         |
| Native sticker appearance and animation      | Pending         |
| Tap-to-play audio                            | Pending         |
| Recipient OS/client versions                 | Not recorded    |
| Behavior on unsupported clients              | Not tested      |

## References

- [Reference sound sticker sender](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/main/src/whatsapp/send.js)
- [Reference encoder adapter](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/main/src/sticker-audio-patch.js)
- [Sticker protocol research](https://docs.baron0.com/WA_STICKERS/)

Reference attribution is preserved in [third-party notices](../THIRD_PARTY_NOTICES.md).
