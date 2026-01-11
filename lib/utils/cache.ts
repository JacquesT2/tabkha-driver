type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private ttlMs: number) {}
  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as any).sort());
  let hash = 0;
  for (let i = 0; i < json.length; i++) hash = ((hash << 5) - hash) + json.charCodeAt(i) | 0;
  return 'h' + (hash >>> 0).toString(16);
}




