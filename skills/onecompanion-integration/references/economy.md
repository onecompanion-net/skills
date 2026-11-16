# Scores, rewards, game data and persistent games

OneCompanion keeps one economy for every game. **Games report facts; the studio sets values; the platform decides
and records.** A game never grants anything itself: it reports what happened, and the platform turns that into
points, XP, currencies, items and leaderboards from the studio's published ruleset, and shows the player the
reward toasts. Read "Scores and leaderboards", "Rewards", "Game data, shops and loadouts" and "Persistent games" in
the live guide before building on any of this.

## What each kind of game gets

| Game                                 | Earns from                                                                 | Boards                                  |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------- |
| solo, `relay`, `lockstep`            | what the platform sees itself: first play of the day, streaks, playtime    | an unverified casual board, if asked for |
| `server`                             | the match result and milestones as well (trusted)                          | ranked boards (staff decision)          |
| `server` + persistent level          | the above, plus characters, loot and trades                                | a season ladder                         |

Everyone gets the platform's level-0 rewards with no work. Studios tune the rest in their console or in
`economy.json`.

## game.json `economy`

```json
"economy": {
	"preset": "arena",
	"stats": ["kills", "deaths", "g_wheelies"],
	"milestones": ["g_first_lap"],
	"slots": ["bike_skin"],
	"config": { "player.max_hp": { "type": "int", "min": 1, "max": 10000, "default": 100 } },
	"attributes": { "character": { "hp": "int", "class": ["mage", "tank"] } },
	"casual": { "by": "score" }
}
```

- `preset`: `arena`, `racer`, `coop`, `party`, `strategy`, `idle`, `solo`, `rpg` or `app` (absent: the first genre's).
- `stats` and `milestones`: keys the server module reports. Platform keys (`score`, `kills`, `place`,
  `duration_ms`, …) or your own prefixed `g_` (`^g_[a-z0-9_]{1,22}$`). Undeclared keys are dropped.
- `config`: values the studio tunes without a new version (`int`, `float`, `bool`, `enum`, `string`, `list`,
  `object`), delivered as `options.config` on the client and `settings.config` in the server's `init`. Read them
  once per session or room, never per tick.
- `casual`: `{ "by": "score" }` or `{ "by": "duration_ms" }`: an unverified best-score board fed by
  `onEvent({ type: 'complete', seconds, score })`. Clearly labelled, never ranked, never pays out.
- `persistent`: the persistent level, below.

## Server modules: facts

- End every match with `ctx.emit({ kind: 'end', result: { winnerTeam, players: [{ playerId, team, score, stats }] } })`.
- Moments inside a match: `ctx.emit({ kind: 'milestone', playerId, key: 'g_boss_down', value? })` (up to 20 a match).
- `player.loadout` at join lists what the player has equipped (`item`, `slot`, attributes). Trust it.

## Client: config, economy and assets

```ts
const maxHp = Number(options.config?.['player.max_hp'] ?? 100);
const me = await options.economy?.get(); // level, xp, balances, items
const shop = await options.economy?.offers();
await options.economy?.purchase('buy_helmet'); // the platform asks the player to confirm
await options.economy?.equip('helmet', true);
const url = options.assets?.url('chars/ember.glb'); // the studio's asset library, or null
```

Every call is checked by the platform; a game can ask, never grant. Show no reward toasts of your own.

## Ranked solo games

A solo game can be ranked with a tiny `server` module that **replays** each run: the client plays with no lag,
sends its inputs at the end, and the module replays them with the same deterministic code before reporting the time
as a `MatchResult`. Start from `bunx github:onecompanion-net/game-cli init <dir> --template verified-solo`.

## The persistent level (characters, loot, trades)

For games whose value is a character that lives for months. Only for `server` games, and only once the platform
team has enabled it for the studio (a version declaring it is refused otherwise). Never build on it unless the user
says it is enabled.

```json
"economy": {
	"persistent": {
		"slots": 3,
		"character": { "kills": "int", "skills": "object" },
		"locations": ["bag", "equipped", "stash"],
		"bag_capacity": 100,
		"stash_capacity": 200,
		"hardcore": false,
		"modes": ["coop"]
	}
}
```

- `modes`: the room modes that carry characters (absent: all). Solo and tournaments never do; other modes stay
  open to guests. Only signed-in players have characters.
- The ruleset (`economy.json`) holds classes (items of kind `character`; none means everyone is the default class),
  `affixes` with roll ranges, `loot_tables` (bases, qualities `normal|magic|rare|set|unique`, weights, levels),
  `quality_caps` per hour and `seasons`.
- The module gets `player.character` at join (`id, name, class, level, xp, state, hardcore, season, items`) and
  reports with events: `character` (save fields), `grant` (loot from a table, one unique `ref` each), `consume`
  and `travel` (send players to a new room of the game). `onPlatform(e)` hears back (`granted`, `traded`);
  `checkpoint()` / `restore(bytes)` survive a room restart.
- **Use the shared helper** in the `persistent-rpg` template's `src/progression.ts` (the same code the platform's
  own games use): `createProgression(emit, random)` then `join`, `award(id, xp)`, `count(id, field)`,
  `drop(id, table, item, chance)` and `onPlatform`. Every call is a no-op without a character, so call it
  unconditionally. Keep the file as it is.
- Trades: `options.trade.offer(otherId, { instances, currencies })`, `confirm`, `cancel`, `on(listener)`. Any change
  needs both players to confirm again; the platform swaps everything at once or nothing. Never for real money.
- Start from `init <dir> --template persistent-rpg`.

## CLI (economy as code)

| Command                                                   | What it does                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `economy init [--preset arena]`                           | writes a starter `economy.json` for the preset (offline)                      |
| `economy pull` / `economy push`                           | the console's draft ↔ `economy.json` (a push makes a draft; owners publish)    |
| `economy validate` / `economy simulate`                   | the server's own check; a replay of the last 7 days (needs the token)         |
| `economy loot <table> --kills 1000 --drop-chance 0.3`     | expected drops against the hourly caps (offline)                              |
| `test [--seconds 60]`                                     | runs the server module headless with random input and lists what we'd refuse   |

Run `test` before every upload of a `server` game: it catches undeclared stats and milestones, loot outside the
tables, crashes on bad input and rooms that never go idle.
