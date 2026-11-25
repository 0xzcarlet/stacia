# Stacia — local WhatsApp sound sticker bot

Send a video with caption `.s`, or reply `.s` to a video. The bot downloads,
converts and attempts to send one native animated sticker with embedded audio.
**Recipient sound playback is experimental and still requires a real device test.**
There is no silent-sticker or separate voice-note fallback.

## Run locally with Docker (recommended)

Docker must be running. Create a private configuration only if it does not exist:

```sh
test -f config.docker.yaml || cp config.docker.example.yaml config.docker.yaml
docker compose build
docker compose run --rm --no-deps bot npm run local -- --config /app/config.yaml
```

Scan the QR from WhatsApp → Linked devices. The same process continues running
after pairing. Keep the terminal open. From a second WhatsApp account send `.ping`,
then send a short MP4 with sound and caption `.s`. You can also reply `.s` to a
previous video. Own messages, groups and view-once media are ignored/rejected.

Default input limit is 20 MiB; output is trimmed to at most 5 seconds. Silent
videos are rejected. One conversion runs at a time with ten waiting slots and one
pending job per verified sender. `.limit` shows personal/global accounting;
`.help` shows usage. Success counts on transport acceptance, not playback.
A send failure with uncertain outcome is not retried and its quota slot is held.

Ctrl+C stops the foreground container. Start the same command again to reuse the
session. Docker uses its own persistent volume; a host-side Node session is not
automatically copied. Do not run host and container bots against the same linked
session at the same time.

After the manual test, stop the foreground command before starting background mode:

```sh
docker compose up -d
docker compose logs -f --tail=100 bot
```

Never run background mode and pairing/foreground mode simultaneously. Check
`docker compose ps` first. Stop background mode with `docker compose stop bot`.
Do not use `docker compose down -v` unless intentionally deleting session and quota data.

## Without Docker

Requires Node.js 24 and FFmpeg/FFprobe with libwebp_anim and libopus:

```sh
npm ci
test -f config.yaml || cp config.example.yaml config.yaml
npm run doctor
caffeinate -i npm run local
```

`caffeinate` is macOS-only; elsewhere use `npm run local`. A separate pairing flow
is available with `npm run pair` followed by `npm start`. No `tsc` step is needed.
The image similarly runs TypeScript with the tsx runtime loader.

## Offline conversion and tests

```sh
npm run convert -- --input video.mp4 --output-dir local-output
npm test

docker build --target test -t stacia:test .
docker run --rm --memory=300m --cpus=1 stacia:test npm test -- --maxWorkers=1
```

Offline conversion writes `sticker.webp` and `audio.ogg` to the requested output
directory. The bot cleans its temporary files after each job and removes abandoned
work directories at startup. Tests use synthetic media and mocked WhatsApp transport;
they never pair or send real messages. See `docs/protocol-spike.md` for the live gate.

## Operations and remaining work

A heartbeat lock prevents concurrent session access and permits recovery after a
hard crash once the 30-second stale interval passes. Do not manually delete a live
lock. Older versions used an empty `.running` directory: stop the old process
before removing that legacy directory if startup reports it.

The Compose budget is 300 MiB and one CPU for local testing. It is not a verified
VPS capacity recommendation. The local Mac image is ARM64; build a Linux AMD64 image
separately for the x86-64 VPS. There are no public application ports.

Health reports connection freshness, not full media/database readiness. Docker does
not restart on health status alone. A revoked session needs operator intervention;
stop the service before re-pairing to avoid restart loops. Back up private config,
database and session volume with the service stopped; never share QR/session files.

Not yet complete: the live playback gate, full PRD configuration, versioned schema
migrations/retention, all failure-path tests, production auth lifecycle, and VPS
resource/soak validation. This milestone is for local testing, not production release.
