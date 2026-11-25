# Operations

[Back to README](../README.md)

## Session lifecycle

Run only one bot process against a session. Stop the background service before starting interactive pairing:

```sh
docker compose ps
docker compose stop bot
docker compose run --rm --no-deps bot npm run local -- --config /app/config.yaml
```

The interactive command remains running after pairing. Stop it before starting `docker compose up -d`.

A heartbeat lock prevents concurrent session access. After a hard crash, recovery may wait for the 30-second stale interval. Do not remove a live lock.

Earlier builds used an empty `.running` directory. If startup reports a legacy lock, stop the old bot and verify that no process is using the session before removing that directory. Preserve the remaining session files.

## Logs and health

```sh
docker compose logs --tail=100 -f bot
docker compose ps
```

Request logs use a hashed request identifier. A transport-accepted log does not prove the recipient played the sticker.

The healthcheck reads connection freshness. It does not yet validate full database or media readiness. Docker does not restart a container solely because it becomes unhealthy.

If the session is revoked, stop the service and investigate before re-pairing. The current `unless-stopped` restart policy can otherwise repeatedly restart the process; production handling of this state remains unfinished.

## Persistent data and backups

The Compose `bot-data` volume holds the database and WhatsApp session. Stop the service before backing up or restoring the volume and private configuration. Preserve ownership so the container's non-root user can write to the restored data.

Do not include temporary media in backups. Treat the session as an account credential. Running `docker compose down -v` deletes the named volume, including the session and quota history.

If rolling back application code, confirm database compatibility before restarting. Restoring an old database also restores old quota and deduplication history; it can allow requests that were already processed after the backup.

## Resource limits

The current Compose configuration uses 300 MiB of memory and one CPU. These values were used for offline container tests; they are not proof of sustained production capacity.

Build the image for the target architecture. An ARM64 image built on Apple Silicon is not an AMD64 VPS image. No application port, domain, reverse proxy, or TLS certificate is required.

## Troubleshooting

| Symptom                       | Action                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker daemon unavailable     | Start Docker Desktop or OrbStack and check `docker info`.                                                                                                  |
| Pairing required              | Run the interactive command in a private terminal and scan its QR.                                                                                         |
| `.ping` gets no reply         | Use a second WhatsApp account, a direct chat, and an exact `.ping` command. Check connection logs.                                                         |
| Sender identity unresolved    | Wait for authenticated contact mapping to synchronize, then retry. Do not infer a phone number from a LID.                                                 |
| Video rejected                | Use a short MP4 with audio within the configured byte limit. View-once media is unsupported.                                                               |
| Sticker has no playable sound | Record the recipient client/version and follow the [protocol validation checklist](protocol.md#live-validation). Sending acceptance alone is insufficient. |
| Send outcome unknown          | Inspect the chat before submitting another request. The bot deliberately retains the quota reservation and does not resend automatically.                  |
| Missing schema extension      | Run `npm run protocol:patch` on the host, or rebuild the Docker image. Investigate a version/hash mismatch instead of bypassing it.                        |
