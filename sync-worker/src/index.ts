/**
 * AnimePlayer Sync Worker
 * 薄 auth backend：username/password 登入，逐個 user 一嚿 JSON（favorites/progress/marks）。
 * Turso token 收喺 env secret，App 永遠接觸唔到（只攞登入後嘅 session token）。
 */
import { createClient, type Client } from '@libsql/client/web';

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  SYNC_HUB: DurableObjectNamespace;
}

// 每個 user 一個 DO：協調佢幾部裝置嘅 WebSocket，data 一變就 broadcast「changed」叫對方 pull。
// 用 WebSocket Hibernation（idle 唔收費）+ SQLite-backed（free plan 可用）。唔存 data,純 pub/sub。
export class SyncHub {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/connect') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server); // hibernation：唔使長駐 memory
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/notify') {
      const msg = JSON.stringify({ type: 'changed', at: Date.now() });
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {}
      }
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  // roster = 各 socket serializeAttachment 落嘅 {deviceId,name,role}（濾走未 hello / 緊閂嗰個）
  roster(excludeWs?: WebSocket): any[] {
    const out: any[] = [];
    for (const s of this.state.getWebSockets()) {
      if (s === excludeWs) continue;
      let a: any = null;
      try {
        a = (s as any).deserializeAttachment();
      } catch {}
      if (a && a.deviceId) out.push(a);
    }
    return out;
  }
  broadcastRoster(excludeWs?: WebSocket) {
    const msg = JSON.stringify({ type: 'roster', devices: this.roster(excludeWs) });
    for (const s of this.state.getWebSockets()) {
      if (s === excludeWs) continue;
      try {
        s.send(msg);
      } catch {}
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const data = typeof raw === 'string' ? raw : '';
    let m: any;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') {
      (ws as any).serializeAttachment({
        deviceId: m.deviceId,
        name: String(m.name || '').slice(0, 64),
        role: m.role,
      });
      this.broadcastRoster(); // 全部更新
      try {
        ws.send(JSON.stringify({ type: 'roster', devices: this.roster() })); // 即刻回 newcomer
      } catch {}
      return;
    }
    // relay 俾其他 socket —— 用 from:deviceId 排除 sender（hibernation 物件 identity 唔可靠）
    const from = m.from;
    for (const s of this.state.getWebSockets()) {
      let a: any = null;
      try {
        a = (s as any).deserializeAttachment();
      } catch {}
      if (a && a.deviceId === from) continue;
      try {
        s.send(data);
      } catch {}
    }
  }
  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {}
    this.broadcastRoster(ws); // roster 排除緊閂嗰個
  }
  async webSocketError(_ws: WebSocket) {}
}

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n: number) => toHex(crypto.getRandomValues(new Uint8Array(n)).buffer);

// PBKDF2(SHA-256, 100k) → hex；密碼一定要雜湊，唔存明文
async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });

let schemaReady = false;
async function ensureSchema(db: Client) {
  if (schemaReady) return;
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         username TEXT UNIQUE NOT NULL,
         pw_hash TEXT NOT NULL,
         pw_salt TEXT NOT NULL,
         token TEXT NOT NULL,
         created_at INTEGER
       )`,
      `CREATE TABLE IF NOT EXISTS user_data (
         user_id INTEGER PRIMARY KEY,
         data TEXT NOT NULL DEFAULT '{}',
         updated_at INTEGER
       )`,
    ],
    'write'
  );
  schemaReady = true;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    try {
      await ensureSchema(db);

      // ---- WebSocket：即時同步（token 經 query string 因為 RN WS 唔易設 header）----
      if (url.pathname === '/ws') {
        const token = url.searchParams.get('token') || '';
        if (!token) return json({ error: 'no token' }, 401);
        const u = await db.execute({ sql: 'SELECT id FROM users WHERE token = ?', args: [token] });
        const urow = u.rows[0];
        if (!urow) return json({ error: 'invalid token' }, 401);
        const id = env.SYNC_HUB.idFromName('user:' + Number(urow.id));
        return env.SYNC_HUB.get(id).fetch(new Request('https://do/connect', req));
      }

      // ---- 註冊 ----
      if (url.pathname === '/signup' && req.method === 'POST') {
        const { username, password } = (await req.json()) as any;
        if (!username || !password) return json({ error: 'username/password required' }, 400);
        const salt = randomHex(16);
        const hash = await pbkdf2(password, salt);
        const token = randomHex(32);
        try {
          const res = await db.execute({
            sql: 'INSERT INTO users (username, pw_hash, pw_salt, token, created_at) VALUES (?,?,?,?,?)',
            args: [username, hash, salt, token, Date.now()],
          });
          const userId = Number(res.lastInsertRowid);
          await db.execute({
            sql: "INSERT INTO user_data (user_id, data, updated_at) VALUES (?, '{}', ?)",
            args: [userId, Date.now()],
          });
          return json({ token });
        } catch {
          return json({ error: 'username taken' }, 409);
        }
      }

      // ---- 登入 ----
      if (url.pathname === '/login' && req.method === 'POST') {
        const { username, password } = (await req.json()) as any;
        const res = await db.execute({
          sql: 'SELECT id, pw_hash, pw_salt, token FROM users WHERE username = ?',
          args: [username ?? ''],
        });
        const row = res.rows[0];
        if (!row) return json({ error: 'invalid credentials' }, 401);
        const hash = await pbkdf2(String(password ?? ''), String(row.pw_salt));
        if (hash !== String(row.pw_hash)) return json({ error: 'invalid credentials' }, 401);
        return json({ token: String(row.token) });
      }

      // ---- 以下需要 Bearer session token ----
      const auth = req.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return json({ error: 'no token' }, 401);
      const u = await db.execute({ sql: 'SELECT id FROM users WHERE token = ?', args: [token] });
      const urow = u.rows[0];
      if (!urow) return json({ error: 'invalid token' }, 401);
      const userId = Number(urow.id);

      if (url.pathname === '/data' && req.method === 'GET') {
        const r = await db.execute({ sql: 'SELECT data FROM user_data WHERE user_id = ?', args: [userId] });
        const data = r.rows[0] ? JSON.parse(String(r.rows[0].data)) : {};
        return json({ data });
      }

      if (url.pathname === '/data' && req.method === 'PUT') {
        const body = (await req.json()) as any;
        const data = JSON.stringify(body?.data ?? {});
        await db.execute({
          sql: `INSERT INTO user_data (user_id, data, updated_at) VALUES (?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`,
          args: [userId, data, Date.now()],
        });
        // 通知該 user 其他裝置即時 pull（即時同步）
        try {
          const hub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName('user:' + userId));
          await hub.fetch('https://do/notify');
        } catch {}
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (e: any) {
      return json({ error: String(e?.message || e) }, 500);
    }
  },
};
