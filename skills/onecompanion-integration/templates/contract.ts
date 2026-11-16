/**
 * The OneCompanion game contract (client half): what `src/client.ts` exports and what the platform passes it.
 * Types only: the game imports nothing from the platform, and runs the same in a first-party build or in the
 * sandboxed frame hosted games get.
 */

export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface OnlineSession {
	/** This player's id in the room, from the platform's `welcome`. */
	readonly selfId: string;
	/** Game bytes to the room; the platform adds its own framing. */
	send(bytes: Uint8Array): void;
}

export type GameClientEvent =
	| { type: 'ready' }
	| { type: 'state'; state: string }
	/**
	 * A run or match ended. `score` feeds the game's casual (unverified) board when its manifest asks for one
	 * (`economy.casual`, docs/economy-plan.md, section 6b); the platform never trusts it for rewards or rankings.
	 */
	| { type: 'complete'; seconds: number; score?: number }
	| { type: 'fatal'; message: string };

/**
 * Saved data for this game, kept by the platform (ADR 0015): per game, per player device, with a quota. Async, string
 * values (serialize your own JSON). Games in a frame also get a `localStorage` backed by it.
 */
export interface GameStorage {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	keys(): Promise<string[]>;
}

export interface MountOptions {
	/** Localised text for one of the game's message keys. */
	t: Translate;
	locale: string;
	dir?: 'ltr' | 'rtl';
	/** Absent = solo. */
	online?: OnlineSession;
	params?: Readonly<Record<string, string>>;
	/** Coarse, non-personal lifecycle events. The host decides what, if anything, to report. */
	onEvent?(event: GameClientEvent): void;
	/** Saved data, kept by the platform. Absent where the host offers none. */
	storage?: GameStorage;
	/** The game's asset library (docs/economy-plan.md, section 6c). Absent where the host has none. */
	assets?: GameAssets;
	/** The studio's game config (section 6c): declared keys only, each within its declared bounds. */
	config?: Readonly<Record<string, unknown>>;
	/** The player's economy in this game (section 7.2): progress, offers, buying and equipping. */
	economy?: GameEconomy;
	/**
	 * Level 5 (section 6d.4): trades with another player in the room. The platform checks ownership and moves the
	 * items; the game shows the trade. Present only in persistent games' rooms.
	 */
	trade?: GameTrade;
}

export interface TradeGive {
	instances: readonly string[];
	currencies: Readonly<Record<string, number>>;
}

export interface TradeState {
	/** The other player's room id. */
	with: string;
	state: 'open' | 'confirmed' | 'done' | 'cancelled' | 'failed';
	mine: TradeGive;
	theirs: TradeGive;
	error?: string;
}

export interface GameTrade {
	/** Put up (or change) what you give; any change needs both players to confirm again. */
	offer(withId: string, give: TradeGive): void;
	confirm(withId: string): void;
	cancel(withId: string): void;
	/** Every change to a trade you are in. Returns an unsubscribe. */
	on(listener: (s: TradeState) => void): () => void;
}

export interface EconomyState {
	level: number;
	xp: number;
	streakDays: number;
	balances: Readonly<Record<string, number>>;
	items: readonly { id: string; qty: number; equipped: string | null }[];
	/** Not signed in: what they earn is kept until they sign in. */
	guest: boolean;
}

export interface EconomyOffer {
	id: string;
	price: Readonly<Record<string, number>>;
	gives: readonly { item: string; qty: number }[];
	limit: number | null;
}

export type EconomyResult = { ok: true } | { ok: false; error: string };

/**
 * The player's economy, through the platform (docs/economy-plan.md, section 7.2). Everything is checked on the
 * server: a game can ask, never grant. `purchase` shows the platform's own confirmation first.
 */
export interface GameEconomy {
	get(): Promise<EconomyState>;
	offers(): Promise<readonly EconomyOffer[]>;
	purchase(offerId: string): Promise<EconomyResult>;
	equip(itemId: string, on: boolean): Promise<EconomyResult>;
	/** Redeem a studio's code; the platform shows what it gave. */
	redeem(code: string): Promise<EconomyResult>;
}

/** Files a studio manages on /developers apart from code, by logical path (`chars/ember.glb`). */
export interface GameAssets {
	/** The URL to load a path from, or null when the live release has no such path. */
	url(path: string): string | null;
	/** Every path in the live release. */
	paths(): readonly string[];
}

export interface GameHandle {
	/** Game bytes from the room. Safe before the engine is ready (the game queues). */
	onMessage(bytes: Uint8Array): void;
	pause(): void;
	resume(): void;
	/** Undoes `mount`: loop, listeners, DOM, GPU and audio. The host may mount again in the same document. */
	dispose(): void;
}

export interface GameClient {
	mount(host: HTMLElement, options: MountOptions): Promise<GameHandle>;
}
