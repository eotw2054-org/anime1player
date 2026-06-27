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
// favorites：兩邊聯集（key = site|slug）。progress / marks：逐 key 取較新（at 大者）。
export function mergeFavorites(local: any[] = [], remote: any[] = [], keyOf: (a: any) => string): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const a of [...local, ...remote]) {
    const k = keyOf(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
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
