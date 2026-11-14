---
name: onecompanion-integration
description: Integrate a browser game (JavaScript or TypeScript, any engine) with the OneCompanion games platform and get it ready to upload: the mount()/dispose() client contract, game.json, in-game text through t() with ICU plurals and right-to-left layout, saved data through options.storage, assets that load inside the sandboxed frame, relay/lockstep/server multiplayer byte protocols, the 12-locale store listing, art, rights, size budgets, and the onecompanion-game CLI (validate, publish, release). Use this whenever someone wants to publish, port, upgrade, adapt or "make work on" OneCompanion (onecompanion.net), mentions game.json, mount(host, options), onecompanion-game, the OneCompanion studio page or developer guide, or is building a game they plan to put on OneCompanion, even if they only say "the platform" in a project that has a game.json with "manifest": 1.
---

# OneCompanion integration

OneCompanion hosts browser games, lists them in its catalog and runs their multiplayer rooms. A game is a
**package**: a `game.json` manifest, a client ES module that exports `mount()`, its text, a store listing and art.
The `onecompanion-game` CLI builds the package with Bun, runs the platform's checks and uploads it; staff review every
version before players see it.

The game runs in a **sandboxed, opaque frame**: no cookies, no network of its own, no access to the page around it.
Everything it gets from the platform arrives through `mount(host, options)`.

## Source of truth

The live developer guide is the contract: `https://onecompanion.net/developers/guide.md` (staging:
`https://staging.onecompanion.net/developers/guide.md`). **Fetch and read it before integrating.** This skill adds the
how-to, the traps and the templates; if it disagrees with the live guide or with the CLI's output, the guide and the
CLI win. Tell the user this skill may be out of date when that happens.

The sample game, a small complete relay game, is `https://github.com/onecompanion-net/sample-game` (Paint Party).

## Workflow

Work in this order. Do not skip the plan.

1. **Survey and plan.** Read the project, then show the user a short plan before changing code:
   - engine and build (vanilla canvas, Three.js, Phaser, PixiJS, Babylon.js…; Vite, webpack, none);
   - how the game starts (what creates the canvas, where the loop lives, what listens to `window`);
   - where player-facing text lives; how it saves; any network code; asset types and how they are loaded;
   - which room kind fits (see below); anything that cannot work in the sandbox (see `references/engines.md`).
   Ask the user for the game `id` (it becomes the URL and can **never** be reused) and their studio handle.
2. **Contract.** Copy `templates/contract.ts` into `src/contract.ts`. Make a client entry (`src/client.ts`) that exports
   `mount(host, options)` and returns `{ onMessage, pause, resume, dispose }`. Start from `templates/client.ts`. Keep
   the game's existing standalone entry working if it has one: the platform only builds `entry.client`.
   Details: `references/contract.md`.
3. **dispose().** Make it undo everything `mount()` did: animation frames, timers, `window`/`document` listeners, DOM
   nodes, WebGL contexts, audio contexts, workers, observers. The platform may mount again in the same page.
4. **Text.** Move every player-facing string into `messages/en.json` and render it with `options.t(key, params)`.
   Use CSS logical properties. Details: `references/text-and-locales.md`.
5. **Saves.** Use `options.storage` (async, string values). Details: `references/storage.md`.
6. **Assets.** Import every file the game loads and resolve it with `new URL(imported, import.meta.url)`. Only
   js, json, wasm, webp, png, jpg/jpeg, ogg, mp3 and woff2 ship. Details: `references/assets-and-bundle.md`.
7. **Network.** Remove every `fetch`/WebSocket/XHR to other hosts. For multiplayer use `options.online.send()` and
   `onMessage()` with the exact byte formats in `references/multiplayer.md`; templates: `templates/relay.ts`,
   `templates/lockstep.ts`.
8. **Package.** Write `game.json` (start from `templates/game.json`; fields in `references/manifest.md`), the listing
   for all 12 locales, the art at exact sizes, the rating, and `rights` with every third-party asset and licence.
9. **Test locally.** Copy `templates/dev/` (an `index.html` and `dev.ts` host): solo, `?net=room` in two tabs (relay),
   `?lang=vi`, `?dir=rtl`.
10. **Check.** Run `node <this skill>/scripts/preflight.mjs .` (or `bun …`) for the traps the CLI cannot see, then the
    project's `validate` script. Fix every issue until both pass.
11. **Stop before publishing.** Summarise what changed, what could not be done and what the user should test by hand.
    The user publishes (`references/publishing.md`).

## Non-negotiables

- **Never handle the studio token.** Do not ask for it, print it, write it to a file, put it in `.env` that is
  committed, or commit it. The user sets `ONECOMPANION_TOKEN` in their own terminal.
- **Do not publish or release** unless the user explicitly asks in this conversation, and even then let them run it.
- **Install the CLI from GitHub, never by registry name:** `bun add -d github:onecompanion-net/game-cli` or
  `npm install -D github:onecompanion-net/game-cli`. Never `npx onecompanion-game` / `bunx onecompanion-game` in a
  project without it installed: that downloads whatever registry package has the name. Bun 1.3+ is required even
  when the user uses npm (the CLI runs on Bun).
- **Import nothing from the platform.** The game depends only on the types in `src/contract.ts`.
- **No network of its own, no `eval`/`new Function`** (the frame's CSP blocks both), no pop-ups, no navigation, no
  cookies.
- **Never send room bytes in solo.** `options.online` absent means solo; sending then is a bridge strike, and three
  strikes end the game. Always `options.online?.send(...)`.
- **Never disguise files** (renaming a `.glb` to `.json`, base64-stuffing a banned type) to get past the type check.
  Reviewers reject it. Tell the user what does not fit; they can ask the platform team.
- **Respect players:** no ads, payments, tracking or collection of personal data; rating must match the content.

## Choosing a room kind (`realtime.kind`)

| Kind       | Use when                                                                            | Ranked         |
| ---------- | ----------------------------------------------------------------------------------- | -------------- |
| `none`     | solo only                                                                           | no             |
| `relay`    | casual co-op/party; one client (the host, lowest slot) can own shared state          | no             |
| `lockstep` | the game can be a deterministic simulation driven only by commands and a seed        | no             |
| `server`   | competitive or cheat-sensitive; needs the studio to be invited (enabled per studio) | staff decision |

Default to `relay` for an existing game with ad-hoc networking, `none` for single-player games, and suggest
`lockstep` only when the simulation is already (or can cheaply become) deterministic. Never choose `server` unless the
user says their studio has it enabled.

## Reference files

Read the one you need when you reach that step:

| File                               | What it covers                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `references/contract.md`           | `mount`, `MountOptions`, `GameHandle`, events, lifecycle, pause/resume, dispose |
| `references/manifest.md`           | every `game.json` field and the rules the validator enforces                   |
| `references/assets-and-bundle.md`  | allowed file types, the asset URL rule, CSS, fonts, wasm, workers, budgets, art |
| `references/text-and-locales.md`   | messages, the ICU subset, listing limits, right-to-left                        |
| `references/storage.md`            | `options.storage`, the `localStorage` stand-in, limits                         |
| `references/multiplayer.md`        | roster, relay, lockstep byte formats and patterns, rate limits                 |
| `references/server-kind.md`        | `createGameModule()` for invited studios                                       |
| `references/engines.md`            | porting notes per engine and what cannot run in the sandbox                    |
| `references/publishing.md`         | CLI commands, version states, review checklist, error codes                    |

Templates (copy, then adapt): `templates/contract.ts`, `templates/client.ts`, `templates/relay.ts`,
`templates/lockstep.ts`, `templates/game.json`, `templates/listing.json`, `templates/dev/index.html`,
`templates/dev/dev.ts`. The preflight script is `scripts/preflight.mjs` (no dependencies; Node 18+ or Bun).

## Definition of done

- `preflight.mjs` reports no errors; the `validate` script passes.
- Solo works; `?net=room` works in two tabs (relay); `?lang=<another locale>` and `?dir=rtl` look right.
- Mounting, disposing and mounting again leaves no duplicate loops, listeners, canvases or sounds.
- `game.json` has the user's real `id` and `studio`; `version` is higher than any earlier upload.
- The user has a list of anything you could not convert (asset types, engine features) and what to check by hand.
