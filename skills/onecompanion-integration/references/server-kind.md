# The `server` room kind (invited studios only)

The room runs your own authoritative module in an isolate with no network. It is enabled per studio by the
platform team; a studio without it gets `"server" is not enabled for this studio` at validation on upload. Ask the
user before building on it.

`game.json`: `"entry": { "client": "./src/client.ts", "server": "./src/server.ts" }` and
`"realtime": { "kind": "server", "tickRate": 20, "snapshotRate": 10, "protocol": 1 }`.

The CLI builds `entry.server` into **one file with no imports and no dynamic `import()`** (`server.js`, ≤ 1 MB). It
must export `createGameModule`:

```ts
export function createGameModule(): GameModule {
	let ctx: GameContext;
	return {
		config: { gameId: 'your-game', maxPlayers: 8, tickRate: 20, snapshotRate: 10, teams: [], modes: ['ffa'] },
		init(c, settings) {
			ctx = c; // settings: { mode, map, maxPlayers, private, options?, config? }
		},
		onJoin(player) {}, // { id, displayName, locale, team, loadout?, character? }
		onLeave(playerId) {},
		onInput(playerId, data) {}, // raw client bytes, ≤ 1024: validate everything, trust nothing
		tick(dt) {}, // fixed steps of 1 / tickRate seconds
		snapshot() {}, // called at snapshotRate: ctx.sendTo(id, bytes) or ctx.broadcast(bytes)
		isIdle: () => false // true when the room can stop ticking (no players)
	};
}
```

`GameContext`: `sendTo(playerId, bytes)`, `broadcast(bytes)`, `emit(event)`, `now()` (monotonic ms from the room),
`random()` (seeded). **Use `ctx.now()` and `ctx.random()`**, never `Date.now()`, `performance.now()` or
`Math.random()`.

Events (`ctx.emit`):

- `{ kind: 'notice', key, params? }`: `key` matches `^[a-z][a-z0-9_]{0,63}$`. Text from the server is always a key
  plus params, never prose.
- `{ kind: 'end', result: { winnerTeam, players: [{ playerId, team, score, stats }] } }`: a match ended; every
  `playerId` must be in the room, scores finite. Stats use platform keys or declared `g_` keys; this result is what
  the studio's ruleset scores and rewards.
- `{ kind: 'milestone', playerId, key: 'g_…', value? }`: a moment inside a match (declared in `economy.milestones`).
- Persistent level only: `character`, `grant`, `consume`, `travel`, plus optional `onPlatform(event)`,
  `checkpoint()` and `restore(bytes)` on the module. See `references/economy.md`.

Limits per room step: replies ≤ 64 KB of sends, ≤ 16 events, ≤ 512 inputs, ≤ 1024 bytes per input. A module that
throws, runs too long or breaks a limit gets strikes; repeated strikes close rooms and suspend the game automatically.
The isolate can lose its memory; the room then calls `init` again and re-joins every player, so keep all state inside
the module object and make `init` + joins rebuild a playable state.

Test it headless before uploading: `onecompanion-game test .` (through the project's scripts) fuzzes the module
and lists what the platform would refuse.

Design: keep `isIdle()` true when no players are present (no tick loops in empty rooms), send compact binary
snapshots (quantised positions, deltas), and validate inputs against the player's own entity only.
