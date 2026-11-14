# Saved data

The frame has an opaque origin: no cookies, no `localStorage`, no IndexedDB, no `sessionStorage` of its own. Saves
go through `options.storage`, which the platform keeps per game and per player device.

```ts
interface GameStorage {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	keys(): Promise<string[]>;
}
```

```ts
const raw = await o.storage?.get('progress');
let progress = { level: 1 };
try {
	if (raw) progress = { ...progress, ...JSON.parse(raw) };
} catch {
	/* corrupt or from an older version: start fresh */
}
await o.storage?.set('progress', JSON.stringify(progress));
```

| Limit    | Value                 |
| -------- | --------------------- |
| Key      | 200 characters        |
| Value    | a string, up to 1 MB  |
| Per game | 10 MB and 2,000 keys  |
| Rate     | 200 requests a second |

## Rules

- **Always guard:** `options.storage` can be absent (a host that offers none). The game must still run.
- Values are strings: serialise JSON yourself, and parse defensively (old versions, corruption).
- **Debounce writes** (for example every 500 ms to 2 s, and on `pause()`), never every frame. Storage over the rate
  is refused.
- Put a schema version in your save (`{ v: 2, ... }`) and migrate old saves.
- Do not store anything personal. Saved data is the game's own state.
- Await `set` when you need to know the save finished (before showing "Saved").

## The localStorage stand-in

Engines that expect `localStorage` (Phaser plugins, Construct exports, many libraries) get a synchronous stand-in,
installed before your code is imported: reads come from a snapshot of your saved data taken at start, writes go
through `storage` in the background. It is fine for existing code, with two caveats:

- A write is not confirmed; if the tab closes immediately, the last write can be lost.
- Prefer `options.storage` in new code, and use it for anything the player would be upset to lose.

In the local dev host (`templates/dev/dev.ts`) storage is backed by the page's real `localStorage` under a prefix.
