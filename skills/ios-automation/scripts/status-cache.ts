interface CacheEntry {
	value: boolean;
	checkedAt: number;
}

export class StatusCache {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly ttlMs: number;

	public constructor(ttlMs = 5000) {
		this.ttlMs = ttlMs;
	}

	public async check(key: string, checker: () => Promise<boolean>): Promise<boolean> {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.checkedAt < this.ttlMs) {
			return cached.value;
		}

		const value = await checker();
		this.cache.set(key, { value, checkedAt: Date.now() });
		return value;
	}

	public invalidate(key?: string): void {
		if (key) {
			this.cache.delete(key);
		} else {
			this.cache.clear();
		}
	}

	public get(key: string): boolean | undefined {
		const entry = this.cache.get(key);
		if (entry && Date.now() - entry.checkedAt < this.ttlMs) {
			return entry.value;
		}
		return undefined;
	}
}
