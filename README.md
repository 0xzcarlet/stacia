# Stacia

A self-hosted WhatsApp bot that converts videos into animated stickers with embedded audio. Built with TypeScript, Baileys, FFmpeg, and SQLite.

> **Experimental:** conversion and protocol serialization are tested offline. Native sticker appearance and sound playback still need verification on a supported WhatsApp client. Stacia is currently intended for local testing.

## Features

- Convert a video using a `.s` caption or a reply to an existing video.
- Generate a 512 × 512 animated WebP with synchronized mono Opus audio.
- Apply daily personal and global quotas, with an unlimited-number allowlist.
- Process requests through a bounded queue with persistent deduplication.
- Keep the WhatsApp session and quota records across restarts.
- Run with Docker Compose, without a public port or web dashboard.

Videos must contain audio. The bot does not substitute a silent sticker or send a separate voice note.

## Quick start with Docker

You need Docker with Compose and a dedicated WhatsApp account. Run these commands from the repository root:

```sh
test -f config.docker.yaml || cp config.docker.example.yaml config.docker.yaml
docker compose build
docker compose run --rm --no-deps bot npm run local -- --config /app/config.yaml
```

Open **WhatsApp → Linked devices → Link a device** on the bot's phone and scan the QR in your terminal. Keep the terminal open: the bot continues running after pairing.

From **another WhatsApp account**, send `.ping`, then send a short video with audio and the caption `.s`. You can also reply `.s` to a previously sent video.

Press `Ctrl+C` to stop. Run the same command again to reuse the saved session. Only run one bot process against a session at a time.

### Run in the background

Stop the foreground command first, then run:

```sh
docker compose up -d
docker compose logs -f --tail=100 bot
```

To stop the service:

```sh
docker compose stop bot
```

The named Docker volume stores the session and database. **`docker compose down -v` deletes that data.**

## Commands

| Command  | Usage                                                       |
| -------- | ----------------------------------------------------------- |
| `.s`     | Send as a video caption, or reply to a video.               |
| `.limit` | Show personal/global quota status and the daily reset time. |
| `.ping`  | Check whether the bot can reply.                            |
| `.help`  | Show input constraints and usage instructions.              |

Commands are case-insensitive and require an exact match after trimming whitespace. The bot accepts direct chats only; group messages and its own messages are ignored. View-once media is not processed.

## Default limits

| Setting              | Default                          |
| -------------------- | -------------------------------- |
| Input size           | 20 MiB                           |
| Output duration      | Up to 5 seconds                  |
| Animated sticker     | 512 × 512, up to 500,000 bytes   |
| Audio                | Mono Opus, up to 256 KiB         |
| Personal quota       | 10 conversions per day           |
| Global quota         | 200 conversions per day          |
| Reset timezone       | `Asia/Jakarta`                   |
| Queue                | 1 active worker, 10 waiting jobs |
| Per-user concurrency | 1 pending or active job          |

A successful conversion is counted when the transport accepts the outgoing message. Pending requests reserve quota. If a send outcome is uncertain, the bot retains that reservation and does not automatically resend.

Edit the private YAML file and restart to apply changes. See [configuration](docs/configuration.md) for supported fields and allowlist behavior.

## Run without Docker

Requirements: Node.js 24, npm, and FFmpeg/FFprobe with `libwebp_anim` and `libopus` support.

```sh
npm ci
test -f config.yaml || cp config.example.yaml config.yaml
npm run doctor
npm run local
```

On macOS, `caffeinate -i npm run local` prevents idle sleep while the command runs. Keep the laptop connected to the internet and its lid open.

The app runs TypeScript through `tsx`; a compilation step is not required. Host and Docker runs use separate session storage by default.

## Development

Convert a local video without connecting to WhatsApp:

```sh
npm run convert -- --input video.mp4 --output-dir local-output
```

This writes `sticker.webp` and `audio.ogg`. Only the bot's protocol adapter combines their uploaded metadata into a native sound-sticker message.

Run the automated tests:

```sh
npm test
```

Or test inside Docker:

```sh
docker build --target test -t stacia:test .
docker run --rm --memory=300m --cpus=1 stacia:test npm test -- --maxWorkers=1
```

Tests use synthetic media and mocked WhatsApp transport. They do not pair an account or verify recipient playback. Baileys is pinned; `npm ci` installs a version-checked schema extension. See [protocol details](docs/protocol.md) before upgrading it.

## Documentation

- [Configuration](docs/configuration.md) — YAML fields, paths, and quotas.
- [Operations](docs/operations.md) — sessions, logs, backups, and troubleshooting.
- [Protocol and compatibility](docs/protocol.md) — audio encoding and live validation.
- [Product requirements](PRD.md) — intended MVP scope, including unfinished work.
- [Archive](archive/README.md) — historical implementation and validation notes.
- [Third-party notices](THIRD_PARTY_NOTICES.md) — reference attribution and license text.

## Project status

The local implementation includes video conversion, sound-sticker payload generation, quota enforcement, queueing, and request recovery. Remaining work includes real-device playback verification, complete PRD configuration coverage, versioned migrations and retention, production auth lifecycle hardening, and VPS load testing.

The Docker memory/CPU limits are a local test budget, not a production capacity guarantee. Build for the target CPU architecture before deploying to a VPS.

Stacia uses an unofficial WhatsApp integration and is not affiliated with Meta or WhatsApp. Use a secondary account for consensual testing. Media is processed by the bot operator; temporary files are removed after processing. Keep QR codes, session files, and private configuration out of source control.
