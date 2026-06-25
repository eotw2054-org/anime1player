// lib/adskip.ts —— HLS 廣告偵測（偵測插入嘅廣告段，回傳時間區間俾播放器自動跳過）
//
// 原理：Anime1 嘅 CDN（ffzy / kkzy / bfikun…）用 server-side ad stitching，
// 將廣告 .ts 段直接縫入 m3u8。廣告段有多個獨立特徵：
//   1. 前後有 #EXT-X-DISCONTINUITY 標記
//   2. segment 來自唔同 host / 唔同 path id / 唔同 bitrate
//   3. 同一條廣告通常重複插入（mid-roll + end-roll）
// 我哋以「內容 path id」為基準，凡 id 唔同嘅連續段就當廣告。

export interface AdRange {
  start: number;   // 秒（含）
  end: number;     // 秒（跳到呢度）
  reason: string;  // 偵測理由（debug 用）
}

interface Seg {
  start: number;
  dur: number;
  uri: string;
  host: string;
  pathId: string;   // path 入面嘅作品 id token（例：12atPoCk）
  discBefore: boolean;
}

const absUrl = (p: string, b: string): string => {
  try { return new URL(p, b).href; } catch { return p; }
};

// 由 segment URI 抽出「path id」：/<date>/<ID>/<bitrate>/hls/xxx.ts → ID
function pathIdOf(uri: string, base: string): string {
  let host = '', path = '';
  try { const u = new URL(absUrl(uri, base)); host = u.host; path = u.pathname; }
  catch { path = uri; }
  const m = path.match(/\/\d{6,8}\/([^/]+)\//);   // /20260623/12atPoCk/
  return (m ? m[1] : host) || host;
}

function hostOf(uri: string, base: string): string {
  try { return new URL(absUrl(uri, base)).host; } catch { return ''; }
}

/** 解析 media playlist 文字 → segment 列表（含絕對時間） */
function parseSegments(media: string, mediaUrl: string): Seg[] {
  const lines = media.split('\n');
  const segs: Seg[] = [];
  let t = 0;
  let discPending = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-DISCONTINUITY')) { discPending = true; continue; }
    const m = line.match(/^#EXTINF:([\d.]+)/);
    if (m) {
      const dur = parseFloat(m[1]);
      const uri = (lines[i + 1] || '').trim();
      segs.push({
        start: t, dur, uri,
        host: hostOf(uri, mediaUrl),
        pathId: pathIdOf(uri, mediaUrl),
        discBefore: discPending,
      });
      discPending = false;
      t += dur;
    }
  }
  return segs;
}

/**
 * 由 media playlist 文字偵測廣告區間。
 * @param media     media playlist (#EXTINF…) 文字
 * @param mediaUrl  該 playlist 嘅絕對網址（用嚟決定「內容 id」）
 */
export function detectAdRanges(media: string, mediaUrl: string): AdRange[] {
  const segs = parseSegments(media, mediaUrl);
  if (segs.length === 0) return [];

  // 內容 id：優先用 playlist URL 自己嘅 id；否則用「總時長最長」嗰個 id
  let contentId = pathIdOf(mediaUrl, mediaUrl);
  const known = new Set(segs.map(s => s.pathId));
  if (!known.has(contentId)) {
    const durById = new Map<string, number>();
    for (const s of segs) durById.set(s.pathId, (durById.get(s.pathId) || 0) + s.dur);
    contentId = [...durById.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // 連續非內容段 → 一個廣告區間
  const ranges: AdRange[] = [];
  let run: Seg[] | null = null;
  const flush = () => {
    if (!run || run.length === 0) return;
    const first = run[0], last = run[run.length - 1];
    ranges.push({
      start: first.start,
      end: last.start + last.dur,
      reason: `id=${first.pathId} host=${first.host} segs=${run.length}`,
    });
    run = null;
  };
  for (const s of segs) {
    if (s.pathId !== contentId) { (run ||= []).push(s); }
    else flush();
  }
  flush();
  return ranges;
}

/** 揀一條 variant media playlist（如果係 master）並回傳其文字 + 絕對網址 */
async function toMediaPlaylist(
  url: string, text: string, headers?: Record<string, string>,
): Promise<{ text: string; url: string }> {
  if (!/#EXT-X-STREAM-INF/.test(text)) return { text, url };
  const lines = text.split('\n');
  const i = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
  const variantUrl = absUrl((lines[i + 1] || '').trim(), url);
  const r = await fetch(variantUrl, { headers });
  return { text: await r.text(), url: variantUrl };
}

/**
 * 完整流程：由 resolveSource() 拎到嘅 .m3u8 網址 → 廣告區間。
 * 失敗（403 地區限制等）回傳 []，唔影響正常播放。
 * @param headers 同播放時一致嘅 headers（User-Agent / Referer），避免被 CDN 擋。
 */
export async function getAdRanges(
  m3u8Url: string, headers?: Record<string, string>,
): Promise<AdRange[]> {
  try {
    const r = await fetch(m3u8Url, { headers });
    if (!r.ok) return [];
    const master = await r.text();
    const { text, url } = await toMediaPlaylist(m3u8Url, master, headers);
    return detectAdRanges(text, url);
  } catch {
    return [];
  }
}

/**
 * 播放器 timeUpdate 用：若 currentTime 落喺廣告區間內，回傳應跳去嘅秒數，否則 null。
 * pad：留 0.3s 緩衝避免邊界抖動。
 */
export function adSkipTarget(currentTime: number, ranges: AdRange[], pad = 0.3): number | null {
  for (const r of ranges) {
    if (currentTime >= r.start - pad && currentTime < r.end - pad) return r.end;
  }
  return null;
}
