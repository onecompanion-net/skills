# The client contract

The client entry (`entry.client` in `game.json`) is an ES module that exports `mount`. The CLI builds it into
`client/index.js`; the frame imports it and calls `mount(host, options)` once. Copy the types from
`templates/contract.ts` into the project. **Import nothing from the platform.**

```ts
export async function mount(host: HTMLElement, options: MountOptions): Promise<GameHandle>;
```

## MountOptions

| Field      | Type                                     | Notes                                                                                   |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `t`        | `(key, params?) => string`               | Your own `messages/<locale>.json`, formatted (ICU subset). Missing key returns the key. |
| `locale`   | `string`                                 | e.g. `"vi"`, `"pt-br"`. Players whose language you do not ship get English text.        |
| `dir`      | `'ltr' \| 'rtl'`                         | `rtl` for Arabic and Urdu. The frame's `<html dir>` is already set.                      |
| `online`   | `{ selfId, send(bytes) } \| undefined`   | **Absent = solo.** `selfId` is room-scoped, not an account id.                           |
| `params`   | `Record<string, string>`                 | Optional launch parameters. Treat as untrusted.                                         |
| `onEvent`  | `(event) => void`                        | Coarse lifecycle events (below).                                                        |
| `storage`  | `GameStorage \| undefined`               | Saved data kept by the platform. Can be absent: always guard.                           |

## GameHandle (what mount returns)

| Method          | Contract                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `onMessage(b)`  | Bytes from the room. Can be called right after `mount` resolves; bytes that arrived earlier are queued by the frame and delivered then. Must never throw on malformed input: validate and drop. |
| `pause()`       | Stop the simulation/input (tab hidden, menus). Keep receiving `onMessage`.                            |
| `resume()`      | Continue. Lockstep games catch up to the room's step here.                                            |
| `dispose()`     | Undo everything `mount` did. Must be idempotent-safe and synchronous.                                 |

## Events (`options.onEvent`)

Only these shapes leave the frame; anything else is dropped and counts as a malformed message (three end the game):

| Event                                    | Rule                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `{ type: 'ready' }`                      | Send after the **first frame is drawn**. No `ready` within 20 s = fatal. |
| `{ type: 'state', state }`               | `state` matches `/^[a-z_]{1,24}$/`: `menu`, `playing`, `game_over`.      |
| `{ type: 'complete', seconds }`          | A run or match ended; finite number, rounded.                             |
| `{ type: 'fatal', message }`             | The game cannot continue. ≤ 200 chars, no personal data.                  |

Never put player names, chat or other user text in events.

## Lifecycle rules

- **Draw only inside `host`.** It is an empty element filling the frame (`position: fixed; inset: 0` parent).
  Size the canvas from `host.clientWidth/clientHeight` × `devicePixelRatio`, and track resizes with a
  `ResizeObserver` on `host` (or `window` `resize`), removed in `dispose`.
- **Do not touch `document.body` structure** beyond appending to `host`; do not replace `document.documentElement`.
- **No top-level side effects in modules.** Starting loops, adding listeners or creating audio at import time
  breaks re-mounting. Do it inside `mount`.
- **`mount` may be async** (load assets, read storage), but keep it under a few seconds and draw a loading frame
  early. Send `ready` once the first real frame is on screen.
- **Audio** needs `capabilities.audio: true`. Create or resume the `AudioContext` on the first user gesture; close it
  in `dispose`.
- **Pointer lock / fullscreen / gamepad** each need their capability flag. Request pointer lock and fullscreen on
  a user gesture. Exiting must be possible with Escape.

## dispose() checklist

```ts
dispose() {
	cancelAnimationFrame(raf);
	clearInterval(timer);
	ro.disconnect();
	window.removeEventListener('keydown', onKey);
	renderer?.dispose();                                // Three.js; or gl.getExtension('WEBGL_lose_context')?.loseContext()
	audio?.close();
	worker?.terminate();
	root.remove();
}
```

Test it: mount, dispose, mount again; there must be one loop, one set of listeners and one canvas.

## Minimal pattern

```ts
import type { GameHandle, MountOptions } from './contract.ts';

export async function mount(host: HTMLElement, o: MountOptions): Promise<GameHandle> {
	const canvas = document.createElement('canvas');
	host.append(canvas);
	let raf = 0;
	let running = true;
	const frame = () => {
		if (running) step();
		draw();
		raf = requestAnimationFrame(frame);
	};
	raf = requestAnimationFrame(() => {
		frame();
		o.onEvent?.({ type: 'ready' });
	});
	return {
		onMessage: (bytes) => handleRoomBytes(bytes),
		pause: () => void (running = false),
		resume: () => void (running = true),
		dispose: () => {
			cancelAnimationFrame(raf);
			canvas.remove();
		}
	};
}
```
