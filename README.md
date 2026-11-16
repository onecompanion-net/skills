# OneCompanion agent skills

Skills that teach AI coding tools (Claude Code, Codex, Cursor, GitHub Copilot and others) how to build games for
[OneCompanion](https://onecompanion.net), the browser games platform that hosts your game, lists it in its catalog
and runs its multiplayer rooms.

| Skill                                                                  | What it does                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`onecompanion-integration`](skills/onecompanion-integration/SKILL.md) | Adapts a JavaScript or TypeScript game (any engine) to the platform: the `mount()` contract, `game.json`, text in 20 languages and right-to-left, saved data, assets that load in the sandbox, relay, lockstep and server multiplayer, scores and rewards (config, shops, casual and verified-solo boards, persistent characters, loot and trades), store listing, art and the publishing CLI. Includes templates and a preflight checker. |

## Install

### Claude Code

```
/plugin marketplace add onecompanion-net/skills
/plugin install onecompanion@onecompanion-skills
```

Or copy the skill folder yourself, for one project or for all of them:

```bash
git clone https://github.com/onecompanion-net/skills /tmp/oc-skills
cp -R /tmp/oc-skills/skills/onecompanion-integration .claude/skills/        # this project
cp -R /tmp/oc-skills/skills/onecompanion-integration ~/.claude/skills/      # every project
```

### Other AI coding tools

With the [skills CLI](https://github.com/vercel-labs/skills), which installs into most agents:

```bash
npx skills add onecompanion-net/skills
```

Or copy `skills/onecompanion-integration` into your project and add this line to your agent's instructions file
(`AGENTS.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `GEMINI.md`…):

```
When working on OneCompanion integration (game.json, mount(), publishing), read
skills/onecompanion-integration/SKILL.md first and follow it.
```

## Use

Open your game's folder in your AI coding tool and ask, for example:

> Make this game ready for OneCompanion. My studio handle is `my-studio`.

The skill reads the live [developer guide](https://onecompanion.net/developers/guide), shows you a plan, integrates
the game, runs the checks and stops before publishing. You publish yourself with your studio token, set in your own
terminal; the skill never asks for it.

Run the preflight checker on any project at any time:

```bash
node skills/onecompanion-integration/scripts/preflight.mjs path/to/your-game
```

## What you need

- [Bun](https://bun.sh) 1.3 or later (the platform CLI runs on it, even if you use npm).
- A studio: apply at [onecompanion.net/developers/apply](https://onecompanion.net/developers/apply).
- The [sample game](https://github.com/onecompanion-net/sample-game) and the
  [CLI](https://github.com/onecompanion-net/game-cli).

## Keeping it current

The developer guide at `https://onecompanion.net/developers/guide.md` is the contract. When the guide and a skill
disagree, the guide wins; please open an issue.


## License

[PolyForm Shield License 1.0.0](LICENSE.md) with the OneCompanion Games Exception (see [NOTICE.md](NOTICE.md)).
Build, test and publish games with it, and ship your games anywhere. Do not use it to build or run a competing
game platform, hosting or multiplayer service, or developer tools or AI skills for one.
