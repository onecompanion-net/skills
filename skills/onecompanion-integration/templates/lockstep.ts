/**
 * The platform's `lockstep` room kind, from the game's side (copy into src/lockstep.ts). The room owns the step
 * counter and orders every command; each client runs the same deterministic simulation. Little-endian:
 *
 *   game → room   [0x01][command, 1..256 bytes]                     at most 15 per second
 *                 [0x03][step u32][hash u32]                        fingerprint of your state after `step`
 *   room → game   [0x01][step u32][from u8][command]                apply at `step`, after that step's update
 *                 [0x02] roster (same as relay; see relay.ts)
 *                 [0x03][step u32]                                  tick: run up to `step`, never past it
 *                 [0x04][seed u32][step u32][n u32] + n × [step u32][from u8][len u16][command]
 *                                                                   start or catch up: reset with seed, replay
 *                 [0x05][step u32]                                  desync at `step`
 *
 * Your own commands come back from the room like everyone else's: apply them only then.
 */
import { fromRoom, type Roster } from './relay.ts';

export const MAX_COMMAND = 256;

/** What your deterministic simulation must provide. No clocks, no Math.random(), no DOM inside. */
export interface Simulation {
	/** Start over at step 0 from the room's seed. */
	reset(seed: number): void;
	/** Advance one fixed step (dt = 1 / tickRate). */
	update(step: number): void;
	/** Apply one player's command at `step` (after that step's update). Validate it; ignore malformed ones. */
	apply(step: number, slot: number, command: Uint8Array): void;
	/** A 32-bit fingerprint of the whole state (e.g. FNV-1a over the fields that matter). */
	hash(): number;
}

export interface LockstepOptions {
	sim: Simulation;
	/** options.online.send */
	send(bytes: Uint8Array): void;
	/** realtime.tickRate in game.json: steps per second. Fingerprints are sent about once a second. */
	stepRate: number;
	onRoster?(roster: Roster): void;
	onDesync?(step: number): void;
}

export class LockstepClient {
	/** The last step the simulation completed. */
	step = 0;
	/** The highest step the room allows. */
	target = 0;
	started = false;
	private queue = new Map<number, { slot: number; command: Uint8Array }[]>();

	constructor(private readonly o: LockstepOptions) {}

	/** Ask the room to apply a command (it comes back to everyone, you included, stamped with its step). */
	command(bytes: Uint8Array): void {
		if (bytes.length < 1 || bytes.length > MAX_COMMAND) throw new RangeError('commands are 1 to 256 bytes');
		const out = new Uint8Array(bytes.length + 1);
		out[0] = 0x01;
		out.set(bytes, 1);
		this.o.send(out);
	}

	/** Feed every message from handle.onMessage here. Never throws on malformed input. */
	receive(b: Uint8Array): void {
		if (b.length < 1) return;
		const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
		switch (b[0]) {
			case 0x01: {
				if (b.length < 7) return;
				this.enqueue(dv.getUint32(1, true), b[5]!, b.slice(6));
				return;
			}
			case 0x02: {
				const m = fromRoom(b);
				if (m?.kind === 'roster') this.o.onRoster?.(m.roster);
				return;
			}
			case 0x03: {
				if (b.length < 5) return;
				this.target = Math.max(this.target, dv.getUint32(1, true));
				return;
			}
			case 0x04: {
				if (b.length < 13) return;
				const seed = dv.getUint32(1, true);
				const at = dv.getUint32(5, true);
				const n = dv.getUint32(9, true);
				// Reset first: the replayed log starts at step 0.
				this.queue.clear();
				this.step = 0;
				this.started = false;
				let o = 13;
				for (let i = 0; i < n; i++) {
					if (o + 7 > b.length) return;
					const step = dv.getUint32(o, true);
					const slot = b[o + 4]!;
					const len = dv.getUint16(o + 5, true);
					if (o + 7 + len > b.length) return;
					this.enqueue(step, slot, b.slice(o + 7, o + 7 + len));
					o += 7 + len;
				}
				this.o.sim.reset(seed);
				this.target = at;
				this.started = true;
				return;
			}
			case 0x05: {
				if (b.length < 5) return;
				this.o.onDesync?.(dv.getUint32(1, true));
				return;
			}
		}
	}

	/**
	 * Run the simulation toward the room's step, at most `maxSteps` now (keep frames responsive when catching up).
	 * Call once per animation frame. Returns how many steps ran.
	 */
	advance(maxSteps = 200): number {
		if (!this.started) return 0;
		let ran = 0;
		while (this.step < this.target && ran < maxSteps) {
			const s = this.step + 1;
			this.o.sim.update(s);
			const cmds = this.queue.get(s);
			if (cmds) {
				for (const c of cmds) this.o.sim.apply(s, c.slot, c.command);
				this.queue.delete(s);
			}
			this.step = s;
			ran++;
			if (s % Math.max(1, this.o.stepRate) === 0) this.fingerprint(s);
		}
		return ran;
	}

	private enqueue(step: number, slot: number, command: Uint8Array) {
		if (step <= this.step && this.started) return; // too late for this client; the room's log is authoritative
		const list = this.queue.get(step);
		if (list) list.push({ slot, command });
		else this.queue.set(step, [{ slot, command }]);
	}

	private fingerprint(step: number) {
		const out = new Uint8Array(9);
		const dv = new DataView(out.buffer);
		out[0] = 0x03;
		dv.setUint32(1, step >>> 0, true);
		dv.setUint32(5, this.o.sim.hash() >>> 0, true);
		this.o.send(out);
	}
}

/** A small seeded PRNG for the simulation (same sequence on every client). Returns [0, 1). */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a over 32-bit integers, for Simulation.hash(). Feed integers (or fixed-point values), not floats. */
export function fnv1a(values: Iterable<number>): number {
	let h = 0x811c9dc5;
	for (const v of values) {
		let x = v | 0;
		for (let i = 0; i < 4; i++) {
			h ^= x & 0xff;
			h = Math.imul(h, 0x01000193);
			x >>>= 8;
		}
	}
	return h >>> 0;
}
