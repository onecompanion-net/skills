/**
 * The platform's `relay` room kind, from the game's side (copy into src/relay.ts). The room passes bytes between
 * players and numbers them by slot; it never shows the game account ids. Wire format (little-endian):
 *
 *   game → room   [0x01][to: a slot, or 255 = everyone else][payload, at most 1024 bytes]   (at most 30 per second)
 *   room → game   [0x01][from slot][payload]
 *                 [0x02][your slot][host slot][n] then n × [slot][name length][name, UTF-8]
 *
 * The host is the lowest slot in the room; it moves when that player leaves. You never receive your own messages.
 */
export const EVERYONE = 255;
export const MAX_PAYLOAD = 1024;
export const MAX_PER_SECOND = 30;

export interface Roster {
	you: number;
	host: number;
	players: { slot: number; name: string }[];
}

export type RoomMessage =
	| { kind: 'data'; from: number; payload: Uint8Array }
	| { kind: 'roster'; roster: Roster };

/** Wrap a payload for the room. `to` is a slot, or EVERYONE (everyone else). */
export function toRoom(payload: Uint8Array, to = EVERYONE): Uint8Array {
	if (payload.length > MAX_PAYLOAD) throw new RangeError('relay payloads are at most 1024 bytes');
	const out = new Uint8Array(payload.length + 2);
	out[0] = 0x01;
	out[1] = to;
	out.set(payload, 2);
	return out;
}

/** Read one message from the room, or null if it is malformed (drop it; never throw). */
export function fromRoom(b: Uint8Array): RoomMessage | null {
	if (b[0] === 0x01 && b.length >= 2) return { kind: 'data', from: b[1]!, payload: b.subarray(2) };
	if (b[0] === 0x02 && b.length >= 4) {
		const players: Roster['players'] = [];
		const text = new TextDecoder();
		let o = 4;
		for (let i = 0; i < b[3]! && o + 2 <= b.length; i++) {
			const slot = b[o]!;
			const len = b[o + 1]!;
			if (o + 2 + len > b.length) return null;
			players.push({ slot, name: text.decode(b.subarray(o + 2, o + 2 + len)) });
			o += 2 + len;
		}
		return { kind: 'roster', roster: { you: b[1]!, host: b[2]!, players } };
	}
	return null;
}

/**
 * Keeps sends under the room's rate: call `send(bytes)` as often as you like; messages beyond `perSecond` in the
 * current second are dropped (return false) instead of being dropped silently by the room. Coalesce state updates
 * so the latest one wins rather than relying on this.
 */
export function rateLimited(send: (b: Uint8Array) => void, perSecond = MAX_PER_SECOND - 5) {
	let windowStart = 0;
	let count = 0;
	return (bytes: Uint8Array): boolean => {
		const now = performance.now();
		if (now - windowStart >= 1000) {
			windowStart = now;
			count = 0;
		}
		if (++count > perSecond) return false;
		send(bytes);
		return true;
	};
}
