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

/**
 * Fake relay room: every tab is a player, and tabs announce themselves so each one keeps a roster. Real slots and
 * names come from the platform; the host is the lowest slot, as there.
 */
let online: MountOptions['online'];
let deliver: (b: Uint8Array) => void = () => {};
let announce = () => {};
if (q.get('net') === 'room') {
	const bc = new BroadcastChannel('oc-dev-room');
	const slot = Math.floor(Math.random() * 250);
	const peers = new Map<number, number>([[slot, Date.now()]]); // slot → last seen
	const roster = () => {
		const now = Date.now();
		for (const [s, seen] of peers) if (s !== slot && now - seen > 5000) peers.delete(s);
		const slots = [...peers.keys()].sort((a, b) => a - b);
		const out = [0x02, slot, slots[0]!, slots.length];
		for (const s of slots) {
			const name = new TextEncoder().encode(`Player ${s}`);
			out.push(s, name.length, ...name);
		}
		deliver(new Uint8Array(out));
	};
	online = {
		selfId: `dev-${slot}`,
		// [0x01][to][payload] → others get [0x01][from][payload]
		send: (b) => bc.postMessage({ from: slot, to: b[1], payload: b.slice(2) })
	};
	bc.onmessage = (e) => {
		const m = e.data as { from: number; to?: number; payload?: Uint8Array; hello?: boolean };
		const known = peers.has(m.from);
		peers.set(m.from, Date.now());
		if (m.hello) {
			if (!known) {
				roster();
				bc.postMessage({ from: slot, hello: true }); // let the newcomer know about us
			}
			return;
		}
		if (!m.payload || (m.to !== 255 && m.to !== slot)) return;
		const out = new Uint8Array(m.payload.length + 2);
		out[0] = 0x01;
		out[1] = m.from;
		out.set(m.payload, 2);
		deliver(out);
	};
	announce = () => {
		roster();
		bc.postMessage({ from: slot, hello: true });
		// Heartbeat: closed tabs drop out of the roster after a few seconds.
		setInterval(() => {
			bc.postMessage({ from: slot, hello: true });
			roster();
		}, 2000);
	};
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
announce(); // after mount, so the game receives its first roster
document.addEventListener('visibilitychange', () => (document.hidden ? handle.pause() : handle.resume()));
