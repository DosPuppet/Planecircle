/**
 * Least recently used cache with a byte budget (PLAN-W W3): the card textures of the 3D board. Entries in use (on the
 * table now) are pinned and never evicted; the others go, oldest first, once the budget is exceeded. Pure: `drop` frees
 * an evicted value (the GPU texture). Map order is the recency order.
 */
export class Lru<V> {
  private entries = new Map<string, { value: V; bytes: number }>();
  private used = 0;

  constructor(
    private budget: number,
    private drop: (value: V) => void,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.used;
  }

  /** The value, made the most recent. */
  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Adds (or replaces) a value, then evicts the oldest unpinned entries over the budget. */
  set(key: string, value: V, bytes: number, pinned: ReadonlySet<string> = new Set()): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.used -= old.bytes;
      if (old.value !== value) this.drop(old.value);
    }
    this.entries.set(key, { value, bytes });
    this.used += bytes;
    this.trim(pinned);
  }

  /** Evicts the oldest entries that are not `pinned` until the cache is within its budget. */
  trim(pinned: ReadonlySet<string>): void {
    for (const [key, e] of this.entries) {
      if (this.used <= this.budget) return;
      if (pinned.has(key)) continue;
      this.entries.delete(key);
      this.used -= e.bytes;
      this.drop(e.value);
    }
  }

  clear(): void {
    for (const e of this.entries.values()) this.drop(e.value);
    this.entries.clear();
    this.used = 0;
  }
}
