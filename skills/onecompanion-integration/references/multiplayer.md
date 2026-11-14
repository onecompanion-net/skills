# Multiplayer

Rooms are run by the platform. The game sees only **slots** (0 to `players.max − 1`), display names (≤ 24 UTF-8
bytes, may be cut mid-character) and a room-scoped `selfId`; never account ids, emails or room ids.

Send with `options.online.send(bytes)`; receive in `handle.onMessage(bytes)`. **All integers are little-endian.**
`options.online` is absent in solo: guard every send with `?.`.

The frame also drops traffic above 60 messages a second or 16 KB a message before it reaches the room, and the room
applies the per-kind limits below. Messages over a limit are **silently dropped**, so stay well under them.

## The roster (every room kind)

```
room → you   [0x02][you u8][host u8][n u8] then n × [slot u8][nameLen u8][name: UTF-8]
```

Sent to everyone whenever someone joins or leaves. `host` is the lowest occupied slot and moves when that player
leaves. Slots are reused: a new player can take a freed slot. Show names with `textContent` only.

## relay

The room forwards bytes between players and stamps the sender's slot. It has no clock and no state.

```
you → room   [0x01][to u8: a slot, or 255 = everyone else][payload ≤ 1024 bytes]   at most 30 per second
room → you   [0x01][from u8][payload]
```

- You never receive your own messages back. Apply your own actions locally.
- A message `to` your own slot or an empty slot is dropped.
- Typical design: the **host** owns the shared state (score, world, timer). Others send inputs or intents; the host
  applies them and broadcasts state. When a new roster arrives, the host sends a full state to newcomers (`to` =
  their slot). When the host leaves, the new lowest slot takes over from its last known state.
- Batch: collect inputs per frame and send at most ~20 per second; send state deltas, not full worlds, each frame.
- Validate every received payload: check length and ranges, clamp coordinates, drop unknown message types. The other
  side is someone's browser.
- Relay games are client-authoritative, so they are never ranked.

Helpers: `templates/relay.ts` (`toRoom`, `fromRoom`, roster parsing).

## lockstep

Every client runs the same deterministic simulation. The room owns the step counter, orders all commands and keeps
a log so late joiners can replay it. `realtime.tickRate` is the **step rate** (steps per second, 1 to 30) and
`realtime.snapshotRate` the rate of tick messages (use about 10).

```
you → room   [0x01][command: 1 to 256 bytes]                     at most 15 per second
             [0x03][step u32][hash u32]                          a fingerprint of your state after `step`
room → you   [0x01][step u32][from u8][command]                  apply at `step`, after that step's update
             [0x03][step u32]                                    tick: you may run up to `step`, never past it
             [0x04][seed u32][step u32][n u32] then n × [step u32][from u8][len u16][command]
                                                                 start or catch up: reset with `seed`, replay
             [0x05][step u32]                                    desync: fingerprints disagreed at `step`
```

How to run it (`templates/lockstep.ts` implements this):

1. On `0x04`: reset the simulation from `seed` at step 0, store the logged commands by step, and set the target step.
   This arrives when you join, and again if the room restarts the run (its log is capped at 512 KB). Always reset.
2. On `0x03`: raise the target step. Run fixed steps until your step equals the target; for each step `s`, run the
   update for `s`, then apply the commands stamped `s` **in the order received**.
3. On `0x01` (command): queue it for its step. **Your own commands come back too**: apply them only when they
   arrive from the room, never immediately, or you will desync.
4. Send a fingerprint (`0x03`) about once a second for a step you have completed (e.g. every `tickRate` steps).
   `0x05` means clients diverged; show a notice and log it while developing.
5. Render by interpolating between the last two simulated steps; input is shown with a small delay, which is the
   price of lockstep. Keep commands small (a few bytes: action id + parameters).

Determinism rules:

- Randomness only from a PRNG seeded with the room's `seed` (e.g. the `mulberry32` in the template). Never
  `Math.random()`, `Date.now()`, `performance.now()` or frame `dt` inside the simulation.
- Fixed timestep: `dt = 1 / tickRate`, identical on every client.
- Avoid floating-point drift that differs between browsers: prefer integers or fixed-point for positions and
  physics; avoid `Math.sin/cos/exp/pow` results feeding back into state (use lookup tables), and never iterate over
  object keys or `Set`s whose order depends on insertion timing.
- The simulation must not read the DOM, the clock, the viewport size or the player's locale.
- Pausing (`pause()`) stops rendering; on `resume()` catch up in chunks (for example 200 steps per frame) so the page
  stays responsive.

Lockstep is client-authoritative, so these games are never ranked.

## server (invited studios only)

Clients send raw bytes (no `0x01` framing) to your server module's `onInput`, and receive whatever it sends. See
`server-kind.md`. Ask the user before choosing it; the studio must have it enabled.

## Testing

- Relay: `templates/dev/dev.ts` fakes a relay room across tabs with a `BroadcastChannel`: open `?net=room` in two tabs.
- Lockstep: write a unit test that feeds the same log to two simulation instances and compares fingerprints, and
  one that replays a `0x04` catch-up mid-game. Real rooms are tested after upload, in the studio's preview.
