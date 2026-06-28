// lib/sync.ts —— 雲端同步 client（對接 Cloudflare Worker + Turso）
// 登入後逐個 user 一嚿 JSON：favorites / progress / marks。

export const SYNC_BASE = 'https://animeplayer-sync.eotw2054.workers.dev';

export interface SyncData {
  favorites?: any[];
  progress?: Record<string, any>;
  marks?: Record<string, any>;
}

async function call(path: string, opts: RequestInit): Promise<any> {
  const res = await fetch(SYNC_BASE + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export async function signup(username: string, password: string): Promise<string> {
  const r = await call('/signup', { method: 'POST', body: JSON.stringify({ username, password }) });
  return r.token as string;
}

export async function login(username: string, password: string): Promise<string> {
  const r = await call('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  return r.token as string;
}

export async function pull(token: string): Promise<SyncData> {
  const r = await call('/data', { method: 'GET', headers: { authorization: 'Bearer ' + token } });
  return (r.data || {}) as SyncData;
}

export async function push(token: string, data: SyncData): Promise<void> {
  await call('/data', {
    method: 'PUT',
    headers: { authorization: 'Bearer ' + token },
    body: JSON.stringify({ data }),
  });
}

// ===== 合併策略 =====
// favorites：per-key last-write-wins（靠每個 entry 嘅 `at`），支援 tombstone（`deleted:true`）。
//   - 兩邊同一 key 取 `at` 大者。
//   - winner 係 tombstone → 保留落 merged set(俾佢繼續傳播、壓住復活),UI 層先過濾 deleted。
//   - 超過 30 日嘅 tombstone 先 GC,避免無限增長。
// 入面每個 entry：{ site, slug, ...anime, at:number, deleted?:boolean }
const TOMB_TTL = 30 * 24 * 60 * 60 * 1000;
export function mergeFavorites(local: any[] = [], remote: any[] = [], keyOf: (a: any) => string): any[] {
  const byKey = new Map<string, any>();
  for (const e of [...remote, ...local]) {
    if (!e) continue;
    const k = keyOf(e);
    const prev = byKey.get(k);
    if (!prev || (e.at ?? 0) >= (prev.at ?? 0)) byKey.set(k, e);
  }
  const cutoff = Date.now() - TOMB_TTL;
  const out: any[] = [];
  for (const e of byKey.values()) {
    if (e.deleted && (e.at ?? 0) < cutoff) continue; // GC 舊 tombstone
    out.push(e);
  }
  return out;
}

export function mergeByRecency(
  local: Record<string, any> = {},
  remote: Record<string, any> = {}
): Record<string, any> {
  const out: Record<string, any> = { ...remote };
  for (const k of Object.keys(local)) {
    const l = local[k];
    const r = remote[k];
    if (!r || (l?.at ?? 0) >= (r?.at ?? 0)) out[k] = l;
  }
  return out;
}
