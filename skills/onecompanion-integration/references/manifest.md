# game.json (manifest version 1)

Two shapes share one schema. The **source** manifest is what you write (entries may be `.ts`). The CLI writes a
**bundle** manifest into `bundle/game.json` with built entries; upload requires the bundle-only fields marked below.

| Field                      | Rule                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `manifest`                 | `1`                                                                                                    |
| `id`                       | `^[a-z][a-z0-9-]{2,31}$`. Your URL. Globally unique, **never reused**, even after deletion. Ask the user. |
| `title`                    | 1 to 40 characters (the catalog localises via the listing, not this).                                  |
| `version`                  | semver (`1.0.0`, `1.2.0-beta.1`). **Higher than every earlier upload, including rejected ones.**        |
| `studio`                   | the studio handle, `^[a-z][a-z0-9-]{1,31}$`; must match the token's studio.                             |
| `genres`                   | 1 to 3 of `action`, `shooter`, `idle`, `rpg`.                                                          |
| `players`                  | `{ min, max }`, integers, `min ≤ max`; **max ≤ 16** for hosted games.                                  |
| `modes`                    | 1+ of `solo`, `coop`, `ffa`, `tdm`. Kind `none` → only `solo`. Any room kind → at least one room mode.  |
| `entry.client`             | relative path to your client entry (`./src/client.ts`).                                                |
| `entry.server`             | only for kind `server`.                                                                                |
| `realtime`                 | `{ kind, tickRate, snapshotRate, protocol }`; see below. Omit for solo-only (kind defaults to `none`).  |
| `locales`                  | in-game text you ship; must include `en`; any of the 20 platform locales.                               |
| `messages`                 | folder with `<locale>.json` for each of `locales`.                                                     |
| `listing`                  | folder with `<locale>.json` for the **12 launch** locales (others optional). *Required for upload.*     |
| `media.cover`              | 1280×720 `.webp`.                                                                                      |
| `media.stills`             | 3 to 8 × 1280×720 `.webp`, each with a 320×180 `<name>-thumb.webp` beside it. *3+ required for upload.* |
| `media.share`              | 1200×630 `.jpg`. *Required for upload.*                                                                |
| `budgets.clientGzipKB`     | ≤ 450. The client entry plus its **static** imports, gzipped, must fit. Set it near your real size.     |
| `capabilities`             | `pointerLock`, `fullscreen`, `gamepad`, `audio` booleans; `network` must be `[]`.                       |
| `rating`                   | `{ level: everyone \| teen \| mature, descriptors: string[] (≤ 8, ≤ 40 chars) }`. *Required for upload.* |
| `rights`                   | `{ ownsAllContent: true, thirdParty: [{ name, licence, url }] }` (≤ 50). *Required for upload.*         |

The 20 platform locales: the 12 launch locales `en vi zh-hans hi es fr ar bn pt-br ru ur id` (listing required) and
`ja ko de tr th fil it pl` (listing optional; players there see the English listing until you add theirs).

## realtime

| kind       | tickRate                              | snapshotRate                                  | Notes                                 |
| ---------- | ------------------------------------- | --------------------------------------------- | ------------------------------------- |
| `none`     | 0                                     | 0                                             | or omit `realtime`                    |
| `relay`    | 0                                     | 0                                             | the room has no clock                 |
| `lockstep` | simulation steps/s, **1 to 30, not 0** | tick messages/s, ≤ tickRate (use ~10)          | snapshotRate 0 means 1 tick message/s |
| `server`   | your module's tick rate (≤ 30)        | snapshots/s (≤ tickRate)                      | needs `entry.server`, invited studios |

`protocol` is your own wire-format version (integer ≥ 1). Raise it when old and new clients cannot play together.

## Template

See `templates/game.json`. Replace `id`, `title`, `studio`, `genres`, `players`, `modes`, `realtime`, `locales`,
`budgets`, `capabilities`, `rating` and `rights` with the real values; never leave `"your-studio"` or a sample id.
