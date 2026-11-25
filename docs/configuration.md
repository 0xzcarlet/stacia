# Configuration

[Back to README](../README.md)

Configuration is loaded once at startup. Restart the bot after changing it; rebuilding the Docker image is not required.

| Environment         | Example                                                       | Private configuration                               |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Node.js on the host | [`config.example.yaml`](../config.example.yaml)               | `config.yaml`                                       |
| Docker Compose      | [`config.docker.example.yaml`](../config.docker.example.yaml) | `config.docker.yaml`, mounted at `/app/config.yaml` |

Both private files are ignored by Git. Commands accept `--config <path>`; the default is `config.yaml`. Relative storage paths resolve from the configuration file's directory.

## Supported fields

| Field                        | Meaning                                            | Default                                                   |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `quota.timezone`             | IANA timezone used for daily accounting            | `Asia/Jakarta`                                            |
| `quota.per_user_daily`       | Daily allowance for each non-exempt sender         | `10`                                                      |
| `quota.global_daily`         | Shared daily allowance for non-exempt senders      | `200`                                                     |
| `quota.unlimited_numbers`    | Quoted E.164 phone numbers exempt from both quotas | `[]`                                                      |
| `media.max_input_bytes`      | Maximum input file size, in bytes                  | `20971520`                                                |
| `media.max_duration_seconds` | Maximum output duration, in seconds                | `5`                                                       |
| `media.sticker_max_bytes`    | Maximum animated WebP size, in bytes               | `500000`                                                  |
| `media.audio_max_bytes`      | Maximum Ogg/Opus size, in bytes                    | `262144`                                                  |
| `storage.database_path`      | SQLite database file                               | `./data/bot.sqlite` on host; `/data/bot.sqlite` in Docker |
| `storage.session_path`       | WhatsApp auth and connection state directory       | `./data/session` on host; `/data/session` in Docker       |
| `storage.temp_path`          | Temporary media workspace                          | `./data/tmp` on host; `/data/tmp` in Docker               |

The input byte ceiling must be positive and at most 100 MiB; the configured duration must be positive and at most 10 seconds. The example values remain the recommended starting point for local testing.

## Quotas and exemptions

- `0` denies new requests from limited users for that quota.
- `null` disables a quota cap; usage is still recorded.
- Allowlisted users bypass personal and global quotas, but still obey resource limits.
- Numbers are matched against verified WhatsApp phone identities. An unresolved LID is not treated as a phone number.
- Failed processing does not consume quota. An uncertain send outcome keeps its reservation.
- Requests settle against their original admission day, including across midnight.
- Configuration changes do not erase existing usage.

Keep allowlist entries quoted and use the full E.164 form, including `+`. Never put auth credentials or encryption keys in YAML. Changing the accounting timezone can change which daily bucket receives new requests; prefer changing it at a reset boundary.

## Settings not yet exposed in YAML

The current implementation fixes these values in code:

- One worker, ten waiting jobs, and one pending/active job per sender.
- A 120-second queue wait deadline.
- A 90-second conversion deadline and a 180-second job abort signal, with separate transport deadlines.
- A finite six-step quality/FPS ladder and 512 × 512 output dimensions.
- Mono Opus audio at 32 kbit/s.

Additional fields shown in the [PRD](../PRD.md) are planned requirements, not necessarily implemented settings. Do not assume adding those fields to YAML changes runtime behavior.
