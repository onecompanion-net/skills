# Porting notes by engine

General shape for every engine: keep the engine, change **how it starts and stops** and **where it loads from**.

1. Find the code that creates the game (canvas, `new Phaser.Game`, `new THREE.WebGLRenderer`, an `init()` on
   `DOMContentLoaded`). Move it into `mount(host, o)` and make it render into `host`.
2. Find every global side effect (`window.addEventListener`, `setInterval`, `document.body.append`, audio contexts)
   and give each a matching teardown in `dispose()`.
3. Find every asset path and convert it to an imported URL (`assets-and-bundle.md`).
4. Find every string the player sees and route it through `o.t`.
5. Keep the old standalone entry (`index.html` + `main.ts`) if the user wants it; make it call `mount` too.

## Vanilla canvas / WebGL

- Create the canvas in `mount`, size it to `host` × `devicePixelRatio` with a `ResizeObserver`.
- Drive the loop with `requestAnimationFrame` and a fixed-step accumulator; stop it in `dispose`.
- WebGL: on dispose call `gl.getExtension('WEBGL_lose_context')?.loseContext()` and delete buffers/textures.

## Three.js

- `new WebGLRenderer({ canvas, antialias })`; `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`;
  resize from `host`.
- Textures: `new TextureLoader().load(new URL(texUrl, import.meta.url).href)` with WebP/PNG/JPG imports.
- **Models:** `.glb`/`.gltf` cannot ship. Build geometry procedurally, or tell the user. Do not disguise files.
- Dispose: `renderer.dispose()`, `renderer.forceContextLoss()`, dispose geometries, materials and textures you
  created, `renderer.domElement.remove()`.
- Three.js is large: keep the entry under budget by importing only what you use (`three` tree-shakes with Bun) and
  lazy-load levels with `import()`.

## Phaser

- `new Phaser.Game({ parent: host, scale: { mode: Phaser.Scale.RESIZE, parent: host }, ... })`.
- Loader: `this.load.image('hero', new URL(heroUrl, import.meta.url).href)`. Never `this.load.setPath('assets/')`
  with bare paths. Audio as OGG/MP3; atlases as PNG + JSON (both importable).
- Dispose: `game.destroy(true)` (removes the canvas) and remove any global listeners you added.
- Phaser alone is around 300 KB+ gzip: check the budget early; lazy-load scenes if needed.
- `game.loop.sleep()` / `wake()` map to `pause()` / `resume()`.

## PixiJS

- `const app = new Application(); await app.init({ resizeTo: host, ... }); host.append(app.canvas);`
- `Assets.load(new URL(url, import.meta.url).href)`.
- Dispose: `app.destroy({ removeView: true }, { children: true, texture: true })`.

## Babylon.js

- `new Engine(canvas, true, { preserveDrawingBuffer: false })`; `engine.resize()` from a `ResizeObserver` on `host`.
- Disable features that fetch from CDNs (the Inspector, default environment textures from `assets.babylonjs.com`,
  Draco/KTX2 decoders loaded from the web): nothing outside the bundle is reachable.
- Dispose: `scene.dispose()`, `engine.dispose()`.

## DOM / React / Svelte / Vue games

- Mount the app into a root element you append to `host`: `createRoot(root).render(...)`, `mount(App, { target })`,
  `createApp(App).mount(root)`; unmount in `dispose`.
- CSS must be inlined (no `.css` files ship): CSS-in-JS, or text imports into a `<style>` element.
- No router that changes `location`; keep state in memory.

## Exports from other tools

- **Unity WebGL** (`.data`, `.unityweb`, `.framework.js.gz`), **Godot** (`.pck`), **GameMaker/GDevelop/Construct
  exports** that depend on HTML pages, CSS, `.data` blobs or service workers generally **cannot** be packaged as-is:
  their file types are not accepted and they expect to own the page. Tell the user plainly; a port to a JS engine is
  the reliable path.
- Emscripten/wasm builds written for the browser can work if their data is in allowed types (`.wasm`, `.json`,
  images, audio) and their loader is pointed at imported URLs.

## Things that never work in the frame

Network calls to any server (analytics, leaderboards, ads, CDNs, multiplayer services such as Socket.IO, Photon,
Colyseus, Firebase): remove them or replace with the room kinds. Third-party sign-in, payments, `window.open`,
`alert/confirm/prompt` (sandbox without modals; build in-game dialogs), service workers, cookies, `eval` or
`new Function` (some template engines and older libraries use them), and fonts or scripts from CDNs.
