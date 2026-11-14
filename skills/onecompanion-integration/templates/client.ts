/**
 * Client entry skeleton (copy into src/client.ts and point game.json `entry.client` at it). Replace the marked parts
 * with the game. Rules: draw only inside `host`, every string through `o.t`, saves through `o.storage`, room bytes
 * only through `o.online?.send`, assets via `new URL(imported, import.meta.url)`, and `dispose()` undoes everything.
 */
import type { GameHandle, MountOptions } from './contract.ts';
// import spriteUrl from './art/sprite.webp';           // assets: import, then resolve against the module
// const sprite = new URL(spriteUrl, import.meta.url).href;

const SAVE_KEY = 'save';
const SAVE_VERSION = 1;

export async function mount(host: HTMLElement, o: MountOptions): Promise<GameHandle> {
	// Root element: everything the game adds goes inside it, so dispose() can remove it in one call.
	const root = document.createElement('div');
	root.dir = o.dir ?? 'ltr';
	root.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none';
	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:absolute;inset:0;inline-size:100%;block-size:100%';
	root.append(canvas);
	host.append(root);
	const ctx = canvas.getContext('2d')!;

	// Saved data (absent where the host offers none). Parse defensively.
	let save = { v: SAVE_VERSION, best: 0 };
	try {
		const raw = await o.storage?.get(SAVE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<typeof save>;
			if (parsed.v === SAVE_VERSION) save = { ...save, ...parsed };
		}
	} catch {
		/* nothing saved, or an older format: start fresh */
	}
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	const persist = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void o.storage?.set(SAVE_KEY, JSON.stringify(save)).catch(() => {}), 1000);
	};

	// Size the canvas from the host, in device pixels.
	const resize = () => {
		canvas.width = Math.max(1, Math.round(root.clientWidth * devicePixelRatio));
		canvas.height = Math.max(1, Math.round(root.clientHeight * devicePixelRatio));
	};
	const ro = new ResizeObserver(resize);
	ro.observe(root);
	resize();

	// Input: listeners on elements you own where possible; anything on window must be removed in dispose().
	const onKey = (e: KeyboardEvent) => {
		if (paused) return;
		// TODO: game input
		void e;
	};
	window.addEventListener('keydown', onKey);

	// Fixed-step loop with an accumulator; rendering every animation frame.
	const STEP = 1 / 60;
	let paused = false;
	let acc = 0;
	let last = performance.now();
	let raf = 0;
	let readySent = false;
	const frame = (now: number) => {
		acc += Math.min(0.25, (now - last) / 1000);
		last = now;
		if (!paused)
			while (acc >= STEP) {
				// TODO: update(STEP)
				acc -= STEP;
			}
		else acc = 0;
		draw();
		if (!readySent) {
			readySent = true;
			o.onEvent?.({ type: 'ready' }); // after the first frame is on screen
			o.onEvent?.({ type: 'state', state: 'menu' });
		}
		raf = requestAnimationFrame(frame);
	};

	function draw() {
		ctx.fillStyle = '#111';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = '#eee';
		ctx.font = `${24 * devicePixelRatio}px system-ui, sans-serif`;
		ctx.direction = o.dir ?? 'ltr';
		ctx.textAlign = 'center';
		ctx.fillText(o.t('title'), canvas.width / 2, canvas.height / 2); // canvas text still goes through t
	}

	raf = requestAnimationFrame(frame);

	return {
		onMessage(bytes) {
			// Room bytes (multiplayer only). Validate; never throw. See relay.ts / lockstep.ts.
			void bytes;
		},
		pause() {
			paused = true;
			persist();
		},
		resume() {
			paused = false;
			last = performance.now();
		},
		dispose() {
			cancelAnimationFrame(raf);
			clearTimeout(saveTimer);
			ro.disconnect();
			window.removeEventListener('keydown', onKey);
			root.remove();
		}
	};
}
