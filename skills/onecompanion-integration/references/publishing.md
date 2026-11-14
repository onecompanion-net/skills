# CLI, publishing and review

## Setup

```bash
bun add -d github:onecompanion-net/game-cli      # or: npm install -D github:onecompanion-net/game-cli
```

```json
{
	"scripts": {
		"validate": "onecompanion-game validate .",
		"pack": "onecompanion-game pack .",
		"publish:game": "onecompanion-game publish ."
	}
}
```

Bun 1.3+ must be installed even with npm. Run the CLI through these scripts (`bun run validate` or
`npm run validate`). One-off check without installing: `npx github:onecompanion-net/game-cli validate .`.

## Commands

| Command                                 | What it does                                                         |
| --------------------------------------- | -------------------------------------------------------------------- |
| `onecompanion-game validate .`          | Builds `bundle/` and runs every check the platform runs              |
| `onecompanion-game pack .`              | Builds `bundle/` only                                                |
| `onecompanion-game publish .`           | Packs, uploads every file and submits the version for review         |
| `onecompanion-game release <versionId>` | Releases an approved version, or rolls back to an earlier one        |
| `onecompanion-game status <versionId>`  | State, automatic issues and review notes                             |

Upload commands read `ONECOMPANION_API` (the site, default `https://onecompanion.net`) and `ONECOMPANION_TOKEN` (a
studio token from the studio page), or `--api` / `--token`. **The user runs these; you do not handle the token.**
Add `bundle/` to `.gitignore`.

What the CLI packs: the built client (`client/`), `server.js` for the server kind, `messages/`, `listing/`,
`media/`, and a `source/` copy of your `.ts/.tsx/.js/.mjs/.json/.css/.glsl/.md` files for reviewers (never served;
`node_modules`, `dist`, `bundle`, dotfiles and `*.test.*` are skipped). Do not keep secrets in source files.

## Version states

```
uploading → in_review → approved → published → superseded
          ↘ rejected_auto       ↘ changes_requested | rejected
```

- Every upload needs a `version` higher than all earlier ones (including rejected).
- Approved is not live: the user releases it from the studio page or with `release`.
- Releasing an earlier version rolls back. Superseded versions stay 30 days for rollback and running rooms.
- Studio members get emails for each step; 20 uploads per studio per day.

## What reviewers check

- It works; `dispose()` cleans up; no console errors on start.
- Every string goes through `t`; the listing is complete and natural in all 12 locales; the layout works right-to-left.
- The rating matches the content; `rights` lists every third-party asset and its licence (code libraries, fonts,
  sounds, art).
- It respects players: no deceptive design, no personal data, no ads or payments (hosted games are free).

## Errors

| Message                  | Fix                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `version_not_newer`      | Raise `version` above every earlier upload                                                |
| `version_uploading`      | An earlier upload of this version did not finish: withdraw it on the studio page, retry   |
| `id_taken`               | Another studio owns that `id`: choose another with the user                               |
| `studio_mismatch`        | `studio` in `game.json` is not the token's studio                                         |
| `unauthorized`           | Token missing, revoked or mistyped: the user makes a new one                              |
| `rate_limited`           | 20 uploads per studio per day                                                             |
| `rejected_auto`          | `onecompanion-game status <versionId>` lists the problems                                 |
| `imports "x": only relative imports inside the bundle work` | A bare import survived bundling: install the dependency so Bun can bundle it |
| `.css files are not allowed` | A CSS import: inline it (`assets-and-bundle.md`)                                     |
| `client entry is N KB gzip, over its budget` | Lazy-load with `import()`, drop unused dependencies, or raise `budgets.clientGzipKB` (≤ 450) |
| `still is W×H, must be 1280×720` | Re-export art at exact sizes                                                      |
| `missing key x` / `arguments {a} differ from en` | Make every locale file match `en.json`                                    |
