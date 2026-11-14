#!/usr/bin/env node
/**
 * OneCompanion preflight: catches integration traps that `onecompanion-game validate` cannot see, because they are in
 * the game's code rather than in the bundle's files. Heuristic and fast; no dependencies. Node 18+ or Bun.
 *
 *   node preflight.mjs [project-dir]        (default: current directory)
 *   node preflight.mjs . --json              machine-readable output
 *
 * Exit code 1 when there are errors. Warnings are things to look at, not necessarily bugs. Always run the CLI's
 * `validate` as well: it is the authoritative check.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');

/** Listing text is required for the 12 launch locales; the platform's 8 newer locales are optional. */
const LOCALES = ['en', 'vi', 'zh-hans', 'hi', 'es', 'fr', 'ar', 'bn', 'pt-br', 'ru', 'ur', 'id'];
const ALLOWED = new Set(['js', 'json', 'wasm', 'webp', 'png', 'jpg', 'jpeg', 'ogg', 'mp3', 'woff2']);
const CODE = /\.(ts|tsx|js|jsx|mjs|svelte|vue)$/;
const SKIP_DIR = /^(node_modules|dist|bundle|build|out|coverage|\..+)$/;
const SKIP_FILE = /(\.test\.|\.spec\.|(^|\/)dev\.(ts|js)$|\.d\.ts$|(^|\/)vite\.config\.|(^|\/)preflight\.mjs$)/;

const findings = [];
const add = (level, file, line, message) => findings.push({ level, file: String(file).replace(/^\.\//, ''), line, message });

// ---- game.json ----------------------------------------------------------------------------------------------
let manifest = null;
const manifestPath = join(dir, 'game.json');
if (!existsSync(manifestPath)) add('error', 'game.json', 0, 'missing: start from the skill\'s templates/game.json');
else {
	try {
		manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	} catch {
		add('error', 'game.json', 0, 'not valid JSON');
	}
}
const kind = manifest?.realtime?.kind ?? (manifest?.entry?.server ? 'server' : 'none');
if (manifest) {
	if (['your-game-id', 'paint-party'].includes(manifest.id))
		add('error', 'game.json', 0, `id "${manifest.id}" is a placeholder: ask the user for the real id`);
	if (manifest.studio === 'your-studio')
		add('error', 'game.json', 0, 'studio is a placeholder: set the studio handle');
	if (Array.isArray(manifest.capabilities?.network) && manifest.capabilities.network.length)
		add('error', 'game.json', 0, 'capabilities.network must be []: games have no network of their own');
	if (kind === 'lockstep' && !manifest.realtime?.tickRate)
		add('error', 'game.json', 0, 'lockstep needs realtime.tickRate (steps per second, 1-30)');
	if (kind === 'lockstep' && !manifest.realtime?.snapshotRate)
		add('warn', 'game.json', 0, 'lockstep with snapshotRate 0 sends one tick a second: use about 10');
	const listing = manifest.listing && join(dir, manifest.listing);
	if (!listing || !existsSync(listing)) add('error', 'game.json', 0, 'listing folder missing (the 12 launch locales are required)');
	else for (const l of LOCALES) if (!existsSync(join(listing, `${l}.json`))) add('error', `${manifest.listing}/${l}.json`, 0, 'missing listing locale');
	const messages = manifest.messages && join(dir, manifest.messages);
	if (!messages || !existsSync(join(messages, 'en.json'))) add('error', 'game.json', 0, 'messages/en.json missing');
	for (const l of manifest.locales ?? [])
		if (messages && !existsSync(join(messages, `${l}.json`))) add('error', `${manifest.messages}/${l}.json`, 0, `listed in locales but missing`);
}

// ---- code ---------------------------------------------------------------------------------------------------
function walk(d, out = []) {
	for (const e of readdirSync(d, { withFileTypes: true })) {
		if (e.isDirectory()) {
			if (!SKIP_DIR.test(e.name)) walk(join(d, e.name), out);
		} else if (CODE.test(e.name)) out.push(join(d, e.name));
	}
	return out;
}
const srcRoot = existsSync(join(dir, 'src')) ? join(dir, 'src') : dir;
const files = walk(srcRoot).filter((f) => !SKIP_FILE.test(relative(dir, f).split(sep).join('/')));

/** [regex, level, message, onlyIf?] checked line by line (comments are stripped first). */
const RULES = [
	[/\beval\s*\(|\bnew\s+Function\s*\(/, 'error', 'eval/new Function is blocked by the frame\'s CSP'],
	[/\bfetch\s*\(\s*[`'"]https?:\/\//, 'error', 'fetch to another host: games have no network of their own (use online.send or bundle the data)'],
	[/\bnew\s+(WebSocket|EventSource|RTCPeerConnection)\s*\(/, 'error', 'direct network connection: use options.online.send / onMessage'],
	[/\bXMLHttpRequest\b|navigator\.sendBeacon/, 'warn', 'XHR/beacon: only your own bundled files are reachable'],
	[/\bio\s*\(\s*[`'"]https?:|socket\.io-client|firebase|@colyseus|photon/i, 'error', 'third-party multiplayer/backend service: use the platform room kinds'],
	[/document\.cookie/, 'error', 'cookies do not exist in the frame'],
	[/\b(indexedDB|sessionStorage)\b/, 'error', 'no IndexedDB/sessionStorage in the frame: use options.storage'],
	[/\blocalStorage\b/, 'warn', 'localStorage is a stand-in whose writes are not confirmed: prefer options.storage for saves'],
	[/\bwindow\.open\s*\(|\b(top|parent)\.location\b|\blocation\.(href|assign|replace)\s*[=(]/, 'error', 'pop-ups and navigation are blocked in the frame'],
	[/\b(alert|confirm|prompt)\s*\(/, 'warn', 'alert/confirm/prompt do not work in the sandbox: build an in-game dialog'],
	[/navigator\.serviceWorker/, 'error', 'service workers are not available in the frame'],
	[/new\s+URL\s*\(\s*[`'"][^`'"]+[`'"]\s*,\s*import\.meta\.url/, 'error', 'new URL("literal", import.meta.url) is not bundled by Bun: import the file, then new URL(imported, import.meta.url)'],
	[/(?:^|[^\w$.])online\s*!\s*\.\s*send|options\.online\.send|\bo\.online\.send/, 'warn', 'send without a solo guard: use online?.send (sending in solo is a strike)'],
	[/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/, 'warn', 'HTML injection: put text in with textContent (and never put player names in HTML)'],
	[/\.textContent\s*=\s*[`'"][^`'"]*[A-Za-z]{3}/, 'warn', 'hard-coded player-facing text? route it through o.t(key)'],
	[/fillText\s*\(\s*[`'"][^`'"]*[A-Za-z]{3}/, 'warn', 'hard-coded canvas text? route it through o.t(key)'],
	[/(?<![\w-])(margin|padding|border)-(left|right)\b|(?<![\w-])(left|right)\s*:\s*[-\d.]|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/, 'warn', 'physical CSS direction: use logical properties (inset-inline-start, margin-inline-end, text-align: start)'],
	[/\bimport\s+[^'"]*['"][^'"]+\.css['"](?!\s*with\s*\{\s*type\s*:\s*['"]text['"])/, 'error', 'CSS import emits a .css file, which is not allowed: import it with { type: "text" } and inject a <style>'],
	[/type\s*:\s*['"]state['"]\s*,\s*state\s*:\s*['"](?![a-z_]{1,24}['"])[^'"]*['"]/, 'error', 'state events must match /^[a-z_]{1,24}$/']
];
const LOCKSTEP_RULES = [
	[/\bMath\.random\s*\(/, 'warn', 'lockstep: Math.random() must not touch the simulation (use the room seed PRNG)'],
	[/\b(Date\.now|performance\.now)\s*\(/, 'warn', 'lockstep: clocks must not touch the simulation (fixed steps only)']
];

const assetRef = /['"`]([^'"`\s]+\.([a-z0-9]{2,6}))['"`]/gi;
const importLine = /^\s*(import|export)\b|\bimport\s*\(/;
let hasMount = false;
let hasDispose = false;
let hasReady = false;

for (const f of files) {
	const rel = relative(dir, f).split(sep).join('/');
	const text = readFileSync(f, 'utf8');
	if (/export\s+(async\s+)?function\s+mount\b|export\s+(const|let)\s+mount\b|export\s*\{[^}]*\bmount\b/.test(text)) hasMount = true;
	if (/\bdispose\s*[(:]/.test(text)) hasDispose = true;
	if (/type\s*:\s*['"]ready['"]/.test(text)) hasReady = true;
	const lines = text.split('\n');
	let inBlock = false;
	lines.forEach((raw, i) => {
		let line = raw;
		if (inBlock) {
			const end = line.indexOf('*/');
			if (end < 0) return;
			line = line.slice(end + 2);
			inBlock = false;
		}
		line = line.replace(/\/\*.*?\*\//g, '');
		const open = line.indexOf('/*');
		if (open >= 0) {
			line = line.slice(0, open);
			inBlock = true;
		}
		line = line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
		if (!line.trim()) return;
		for (const [re, level, msg] of RULES) if (re.test(line)) add(level, rel, i + 1, msg);
		if (kind === 'lockstep') for (const [re, level, msg] of LOCKSTEP_RULES) if (re.test(line)) add(level, rel, i + 1, msg);
		for (const m of line.matchAll(assetRef)) {
			const ext = m[2].toLowerCase();
			const path = m[1];
			if (/^https?:\/\//.test(path)) {
				if (/\.(png|jpe?g|webp|gif|svg|mp3|ogg|wav|glb|gltf|woff2?|ttf|json|wasm|js)$/i.test(path))
					add('error', rel, i + 1, `remote asset ${path}: nothing outside the bundle is reachable`);
				continue;
			}
			const isAsset = /^(png|jpe?g|webp|gif|svg|bmp|mp3|ogg|wav|m4a|aac|flac|glb|gltf|bin|ktx2|basis|hdr|exr|fbx|obj|mp4|webm|ttf|otf|woff2?|css|html|wasm|data|pck)$/.test(ext);
			if (!isAsset) continue;
			if (!ALLOWED.has(ext) && ext !== 'css')
				add('error', rel, i + 1, `.${ext} cannot ship (allowed: ${[...ALLOWED].join(', ')}): convert it, or tell the user`);
			else if (!importLine.test(line) && /^(\.{0,2}\/|[\w-]+\/)/.test(path) && ext !== 'css')
				add('warn', rel, i + 1, `"${path}" looks like a bare asset path: import the file and use new URL(imported, import.meta.url), or it will not be in the bundle`);
		}
	});
}

if (manifest?.entry?.client) {
	const entry = join(dir, manifest.entry.client);
	if (!existsSync(entry)) add('error', 'game.json', 0, `entry.client ${manifest.entry.client} does not exist`);
}
if (files.length && !hasMount) add('error', manifest?.entry?.client ?? 'src', 0, 'no exported mount(host, options) found');
if (files.length && !hasDispose) add('error', manifest?.entry?.client ?? 'src', 0, 'no dispose() found: the handle must undo everything mount() did');
if (files.length && !hasReady) add('error', manifest?.entry?.client ?? 'src', 0, "no onEvent({ type: 'ready' }): without it the game is killed after 20 s");

// ---- art sizes (quick header read; the CLI checks exactly) ------------------------------------------------
function webpSize(b) {
	const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
	if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WEBP') return null;
	const c = s(12, 4);
	if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
	if (c === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
	if (c === 'VP8X') return [(b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1];
	return null;
}
const checkArt = (p, w, h, what) => {
	if (!p) return;
	const abs = join(dir, p);
	if (!existsSync(abs)) return add('error', p, 0, `${what} missing`);
	if (!/\.webp$/i.test(p)) return;
	const size = webpSize(readFileSync(abs));
	if (size && (size[0] !== w || size[1] !== h)) add('error', p, 0, `${what} is ${size[0]}×${size[1]}, must be ${w}×${h}`);
};
if (manifest?.media) {
	checkArt(manifest.media.cover, 1280, 720, 'cover');
	for (const s of manifest.media.stills ?? []) {
		checkArt(s, 1280, 720, 'still');
		checkArt(s.replace(/\.webp$/i, '-thumb.webp'), 320, 180, 'still thumbnail');
	}
	if ((manifest.media.stills ?? []).length < 3) add('error', 'game.json', 0, 'media.stills needs 3 to 8 images');
	if (manifest.media.share && !existsSync(join(dir, manifest.media.share))) add('error', manifest.media.share, 0, 'share image missing');
}

// ---- report -------------------------------------------------------------------------------------------------
const errors = findings.filter((f) => f.level === 'error').length;
if (json) console.log(JSON.stringify({ errors, findings }, null, 2));
else {
	for (const f of findings) console.log(`${f.level === 'error' ? 'error' : 'warn '} ${f.file}${f.line ? `:${f.line}` : ''}  ${f.message}`);
	console.log(`\n${errors} error(s), ${findings.length - errors} warning(s) in ${files.length} file(s). Then run the validate script (onecompanion-game validate .).`);
}
process.exit(errors ? 1 : 0);
