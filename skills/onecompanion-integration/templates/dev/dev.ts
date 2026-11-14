/**
 * Local dev host (copy to src/dev.ts, with index.html at the project root; add "dev": "bun --port 5191 ./index.html"
 * to package.json). It does what the platform does for your game, in a few lines: mounts it with your messages,
 * saved data and, with `?net=room`, a fake relay room across browser tabs (BroadcastChannel). Not uploaded: the CLI
 * builds only entry.client.
 *
 *   http://localhost:5191/             solo
 *   http://localhost:5191/?net=room    open in two or more tabs (relay games)
 *   &lang=vi                           another locale        &dir=rtl   right-to-left layout
 *   &remount=1                         mount, dispose and mount again (checks dispose())
 *
 * Bun is the dev server even if you use npm for packages.
 */
import en from '../messages/en.json';
import { mount } from './client.ts';
import type { GameHandle, GameStorage, MountOptions } from './contract.ts';

// Add the locales you ship: import vi from '../messages/vi.json';
const tables: Record<string, Record<string, string>> = { en };

const q = new URLSearchParams(location.search);
const locale = q.get('lang') ?? 'en';
const table: Record<string, string> = tables[locale] ?? en;
const pr = new Intl.PluralRules(locale);

/** A small formatter for `{name}`, plural and select (the platform uses its full ICU subset). */
function t(key: string, params: Readonly<Record<string, string | number>> = {}): string {
	const src = table[key] ?? en[key as keyof typeof en] ?? key;
	return src
		.replace(/\{(\w+), (plural|select), ((?:[=\w-]+ \{[^}]*\}\s*)+)\}/g, (_m, k: string, type: string, cases: string) => {
			const v = params[k];
			const map = Object.fromEntries([...cases.matchAll(/([=\w-]+) \{([^}]*)\}/g)].map((m) => [m[1], m[2]]));
			if (type === 'select') return map[String(v)] ?? map.other ?? '';
			const n = Number(v ?? 0);
			return (map[`=${n}`] ?? map[pr.select(n)] ?? map.other ?? '').replace(/#/g, String(n));
		})
		.replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? ''));
}

/** Fake relay room: every tab is a player. Real slots come from the platform. */
let online: MountOptions['online'];
let deliver: (b: Uint8Array) => void = () => {};
if (q.get('net') === 'room') {
	const bc = new BroadcastChannel('oc-dev-room');
	const slot = Math.floor(Math.random() * 8);
	online = {
		selfId: `dev-${slot}`,
		// [0x01][to][payload] → others get [0x01][from][payload]
		send: (b) => bc.postMessage([slot, b[1], b.slice(2)])
	};
	bc.onmessage = (e) => {
		const [from, to, payload] = e.data as [number, number, Uint8Array];
		if (to !== 255 && to !== slot) return;
		const out = new Uint8Array(payload.length + 2);
		out[0] = 0x01;
		out[1] = from;
		out.set(payload, 2);
		deliver(out);
	};
	const name = new TextEncoder().encode(`Player ${slot}`);
	queueMicrotask(() => deliver(new Uint8Array([0x02, slot, slot, 1, slot, name.length, ...name])));
}

/** On the platform, saved data is kept by the platform; here, this page's localStorage stands in for it. */
const ns = 'oc-dev:';
const storage: GameStorage = {
	get: async (k) => localStorage.getItem(ns + k),
	set: async (k, v) => localStorage.setItem(ns + k, v),
	delete: async (k) => localStorage.removeItem(ns + k),
	keys: async () =>
		Object.keys(localStorage)
			.filter((k) => k.startsWith(ns))
			.map((k) => k.slice(ns.length))
};

const options: MountOptions = {
	t,
	locale,
	dir: q.get('dir') === 'rtl' ? 'rtl' : 'ltr',
	...(online ? { online } : {}),
	storage,
	onEvent: (e) => console.info('[game event]', e)
};
const host = document.getElementById('host')!;
document.documentElement.dir = options.dir!;
document.documentElement.lang = locale;

let handle: GameHandle = await mount(host, options);
if (q.get('remount') === '1') {
	handle.dispose();
	console.info('[dev] disposed; host children left behind:', host.childElementCount);
	handle = await mount(host, options);
}
deliver = (b) => handle.onMessage(b);
document.addEventListener('visibilitychange', () => (document.hidden ? handle.pause() : handle.resume()));
