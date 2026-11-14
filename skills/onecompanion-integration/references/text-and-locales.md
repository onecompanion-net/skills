# Text, languages and right-to-left

OneCompanion is in 12 languages: `en vi zh-hans hi es fr ar bn pt-br ru ur id`.

## In-game text: `messages/<locale>.json`

- Flat object of `key → message`. Keys match `^[a-z][a-z0-9_]{0,63}$`. Values are strings, ≤ 2000 characters.
- `en.json` is required. Ship any other locales and list them in `game.json` `locales`. Players whose language you do
  not ship get English.
- Every locale file must have **exactly** the keys of `en.json`, with the same placeholder names.
- **No markup.** `<` and `>` are rejected. Put text into the DOM with `textContent`, never `innerHTML`.

### The ICU subset `t` understands

```json
{
	"score": "Score: {points}",
	"lives": "{count, plural, =0 {No lives left} one {# life} other {# lives}}",
	"winner": "{team, select, red {Red wins} blue {Blue wins} other {Draw}}",
	"quote": "Press ''{key}'' to jump"
}
```

- `{arg}` substitution; `{arg, plural, …}` with `=N`, `zero one two few many other` and `#`; `{arg, select, …}`.
- `plural` and `select` need an `other` case. Nesting up to 4 deep. `''` is a literal apostrophe; `'{'` quotes a brace.
- No `number`, `date`, `time` or other formatters: format numbers yourself with `Intl.NumberFormat(options.locale)`
  and pass the string.

### Rules for code

- **Every** player-facing string goes through `o.t(...)`: buttons, HUD labels, tutorial text, game-over screens,
  aria-labels, canvas-drawn text.
- Never build sentences by concatenation (`t('you') + ' ' + t('won')`); make one message with placeholders.
- Counts always use plural messages, even for English.
- Text drawn on a canvas must still come from `t`, with a font that covers the script (ship a WOFF2 if needed) and
  `ctx.direction = o.dir` for right-to-left.
- Debug logs and error codes may stay English; they are not shown to players.

## Right-to-left

When `o.dir === 'rtl'` (Arabic, Urdu) the frame's `<html dir="rtl">` is set. Set `root.dir = o.dir` on your root too.

Lay out with CSS **logical properties**:

| Instead of                          | Use                                   |
| ----------------------------------- | ------------------------------------- |
| `left` / `right`                    | `inset-inline-start` / `inset-inline-end` |
| `margin-left` / `padding-right`     | `margin-inline-start` / `padding-inline-end` |
| `text-align: left`                  | `text-align: start`                   |
| `border-left`                       | `border-inline-start`                 |
| `width` / `height` (for flow sizes) | `inline-size` / `block-size`          |
| `float: left`                       | `float: inline-start`                 |

Mirror directional UI (back arrows, progress bars) in RTL. Do not mirror gameplay worlds, clocks, or numbers.

## Store listing: `listing/<locale>.json`

Required for **all 12** locales (the catalog shows it in every language):

```json
{
	"tagline": "Paint one wall together.",
	"pitch": "A shared wall and a brush for everyone in the room.",
	"about": ["Drag to paint. In a room, every stroke appears on everyone's wall."],
	"seoTitle": "Paint Party",
	"seoDescription": "Paint a wall together with friends in your browser.",
	"coverAlt": "Colourful dots on a dark wall"
}
```

| Field            | Limit                              |
| ---------------- | ---------------------------------- |
| `tagline`        | 120 characters                     |
| `pitch`          | 240                                |
| `about`          | 1 to 4 paragraphs, each ≤ 600      |
| `seoTitle`       | 70                                 |
| `seoDescription` | 170                                |
| `coverAlt`       | 160 (describe the cover image)     |

No markup (`<`, `>`). Translate properly, keeping the game's name as the studio wants it. If you translate, tell the
user which locales you wrote so a native speaker can review them; reviewers check that text reads naturally.
