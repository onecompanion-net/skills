# Assets, the bundle and the sandbox

## How the game is served

The CLI builds `entry.client` with `Bun.build` (ESM, minified, code splitting) into `client/`. The platform serves
the version from `<origin>/g/<game>/<version>/`: the frame document is `frame.html` at that folder's root, and your
code is `client/index.js` plus `client/chunk-*.js` and `client/asset-*.*`.

Only what the build emits ships. **There is no `public/` folder**: a file that is not imported by your code is not
in the bundle.

## The asset URL rule

Import the file, then resolve it against the module, not the page:

```ts
import spriteUrl from './art/sprite.png';
import hitUrl from './audio/hit.ogg';

const sprite = new URL(spriteUrl, import.meta.url).href;
const hit = new URL(hitUrl, import.meta.url).href;
```

Why: Bun turns `import x from './a.png'` into the string `"./asset-<hash>.png"`, which a browser resolves against the
**document** (`/g/<game>/<v>/`), but the file is in `client/`. `new URL(x, import.meta.url)` fixes that, and also
works on the local dev server.

Do **not** write `new URL('./a.png', import.meta.url)` with a literal path: Bun does not bundle that pattern, so the
file never ships. Do not pass engine loaders bare relative paths like `'assets/a.png'` either.

## Allowed file types

Only these are stored and served (anything else fails validation):

| Type   | Extensions      |
| ------ | --------------- |
| code   | `.js`           |
| data   | `.json`         |
| wasm   | `.wasm`         |
| images | `.webp` `.png` `.jpg` `.jpeg` |
| audio  | `.ogg` `.mp3`   |
| fonts  | `.woff2`        |

**Not accepted:** `.css`, `.html`, `.svg`, `.gif`, `.wav`, `.glb`/`.gltf`/`.bin`, `.ktx2`, `.basis`, `.mp4`/`.webm`,
`.ttf`/`.otf`/`.woff`, `.txt`, `.data`, `.pck`, `.unityweb`, source maps. Convert: WAV → OGG or MP3, GIF/SVG →
PNG/WebP, TTF → WOFF2. A 3D model format has no direct path today: build geometry in code, or tell the user (do not
rename files to pass the check). Every file's first bytes must match its extension, and text files must be UTF-8.

## CSS

A CSS import makes Bun emit `client/index.css`, which is rejected. Inline your styles instead:

```ts
import css from './game.css' with { type: 'text' }; // Bun: the file's text as a string
const style = document.createElement('style');
style.textContent = css;
root.append(style);
```

Or build styles in JS. Inline `<style>` and `style=""` are allowed by the frame's CSP. Scope selectors under your root
element and use logical properties (see `text-and-locales.md`).

## Fonts, wasm, workers

- **Fonts:** import the `.woff2`, then `new FontFace('Game', `url(${new URL(fontUrl, import.meta.url)})`)`,
  `await face.load()`, `document.fonts.add(face)`. Do not rely on system fonts for non-Latin scripts.
- **wasm:** allowed (`'wasm-unsafe-eval'`). Import the `.wasm` and fetch it via `new URL(wasmUrl, import.meta.url)`;
  `WebAssembly.instantiateStreaming` works.
- **Workers:** `worker-src` allows your folder and `blob:`. Build the worker as its own entry or create it from a
  blob; test it in the packed bundle.
- **`fetch`** works only for your own version's files. Nothing else is reachable.

## The frame's CSP (summary)

`default-src 'none'`; scripts, styles, images, media, fonts, workers and `connect-src` only from your version folder
(plus `data:`/`blob:` for images, media, fonts and workers, and inline styles). No `eval`, no `new Function`, no inline
`<script>`, no forms, no plug-ins. The frame is sandboxed with `allow-scripts` (and `allow-pointer-lock` if declared):
no same origin, no pop-ups, no top navigation, no cookies, no `localStorage`/IndexedDB of its own.

## Budgets and limits

| Limit                         | Value                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| Client entry + static imports | ≤ `budgets.clientGzipKB` (max 450 KB gzip). Lazy-load with `import()`.   |
| Server module                 | 1 MB, one file, no imports                                               |
| Upload                        | ≤ 400 files, ≤ 10 MB per file, ≤ 25 MB total                             |
| Paths                         | letters, digits, `_ . -`, ≤ 6 folders deep                               |

Dynamic `import()` chunks do not count against the entry budget, so split big engines and levels:
`const { startLevel } = await import('./levels/forest.ts');`

## Art

| Asset       | Requirement                                                          |
| ----------- | -------------------------------------------------------------------- |
| Cover       | 1280×720 WebP                                                        |
| Stills      | 3 to 8, 1280×720 WebP, each with a 320×180 `-thumb.webp` next to it  |
| Share image | 1200×630 JPEG                                                        |

Sizes are read from the image headers and must match exactly. Use real gameplay captures. If the user has none, say
so; placeholder art will not pass review.
