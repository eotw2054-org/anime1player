// lib/anime1.ts —— Anime1 資料層（由 20260621.html 移植，純函數，原生 fetch 無 CORS）
import { parse } from 'node-html-parser';

// 影片來源（catalog 來源）。anime1 family(me/in/one/cc) + 其他站(gimy)。
// loadList loop 經 getProviderBySite(SITES[k]) 路由去對應 provider。
export const SITES: Record<string, string> = {
  me: 'https://anime1.me',
  in: 'https://anime1.in',
  one: 'https://anime1.one',
  cc: 'https://anime1.cc',
  // Gimy 鏡像（MacCMS,經 lib/sources/maccms.ts）。gimyplus 做主,其餘做後備。
  gimyplus: 'https://gimyplus.com',
  gimytv: 'https://gimytv.biz',
  gimypro: 'https://gimypro.com',
  gimytw: 'https://gimytw.net',
};

/** 設定面板嘅來源顯示名（anime1 family 用 anime1.<k>,其他站自訂）。 */
export const SITE_LABELS: Record<string, string> = {
  gimyplus: 'Gimy+（動漫·主）',
  gimytv: 'GimyTV（動漫）',
  gimypro: 'GimyPro（動漫）',
  gimytw: 'GimyTW（動漫）',
};

/** 預設關咗嘅來源（後備鏡像;同 catalog 重複,用戶想要先開）。 */
export const SITE_DEFAULT_OFF = new Set<string>(['gimytv', 'gimypro', 'gimytw']);

/** 某來源預設開唔開（新 key 首次出現時用）。 */
export const siteDefaultOn = (k: string): boolean => !SITE_DEFAULT_OFF.has(k);

export interface Anime {
  site: string;           // 來源站（絕對網址，例：https://anime1.in）
  slug: string;
  name: string;
  num: number | null;     // 集數數量（連載中(05) → 5）；合集等為 null
  cntText: string;        // 原始集數文字
  latestUrl: string;      // 最新一集網址（絕對）
  update: string;         // 更新時間 yyyy-mm-dd
  updateYear: string;     // 更新年份（分組用）
  search: string;         // 搜尋用（中文名+簡體+拼音，lowercase）
}

export interface Stream {
  label: string;
  embedUrl: string;       // 播放器 iframe 網址
}

export interface EpisodeInfo {
  streams: Stream[];
  nextUrl: string | null;
  prevUrl: string | null;
  episodeNo: string;
}

function abs(path: string, base: string): string {
  try { return new URL(path, base).href; } catch { return path; }
}

export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return await r.text(); // 原生網絡，唔受 CORS 限制
}

// ---------- 首頁列表（TablePress）----------
export function parseHomeList(html: string, site: string): Anime[] {
  const root = parse(html);
  const seen = new Map<string, Anime>();
  for (const tr of root.querySelectorAll('#tablepress-1 tbody tr')) {
    const link = tr.querySelector('.column-1 a');
    const cntCell = tr.querySelector('.column-2');
    if (!link || !cntCell) continue;
    const href = link.getAttribute('href') || '';
    const m = href.match(/^\/([^\/?#]+)\/?$/);
    if (!m) continue;
    const slug = m[1];
    if (seen.has(slug)) continue;
    const cntText = cntCell.text.trim();
    const numMatch = cntText.match(/(\d+)/);
    const tds = tr.querySelectorAll('td');
    const update = tds.length >= 2 ? tds[tds.length - 2].text.trim() : '';
    const onclick = cntCell.getAttribute('onclick') || '';
    const latestPath = (onclick.match(/'([^']+)'/) || [])[1] || '/' + slug;
    const search = tr.querySelector('.column-6')?.text.trim() || '';
    const name = link.text.trim();
    seen.set(slug, {
      site,
      slug,
      name,
      num: numMatch ? parseInt(numMatch[1], 10) : null,
      cntText,
      latestUrl: abs(latestPath, site),
      update,
      updateYear: (update.match(/(20\d\d)/) || [])[1] || '其他',
      search: (name + ' ' + search).toLowerCase(),
    });
  }
  return [...seen.values()];
}

// ---------- 由集數數量直接產生每集網址 ----------
export function buildChapters(site: string, slug: string, count: number) {
  const out: { ep: number; url: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const code = '10' + String(i).padStart(3, '0') + '000';
    out.push({ ep: i, url: `${site}/${slug}-${code}` });
  }
  return out;
}

// ---------- 集數頁 → 收集播放器來源 + 上/下一集 ----------
function episodeNo(url: string): string {
  try {
    const parts = url.split('-');
    const code = parts[parts.length - 1];
    if (!code || code.length < 5) return '?';
    const n = parseInt(code.slice(2, 5), 10);
    return isNaN(n) ? '?' : String(n);
  } catch {
    return '?';
  }
}

function buildPrevUrl(currentUrl: string): string | null {
  try {
    const u = new URL(currentUrl);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    // code 格式：10 + 三位集數 + 000（例：10229000 = 第229集）
    const m = last.match(/^(.*)-10(\d{3})000$/);
    if (!m) return null;
    const slug = m[1];
    const ep = parseInt(m[2], 10);
    if (isNaN(ep) || ep <= 1) return null;
    const code = '10' + String(ep - 1).padStart(3, '0') + '000';
    u.pathname = '/' + slug + '-' + code;
    return u.href;
  } catch {
    return null;
  }
}

export async function parseEpisode(episodeUrl: string): Promise<EpisodeInfo> {
  const html = await fetchHtml(episodeUrl);
  const root = parse(html);
  const streams: Stream[] = [];

  const vframe =
    root.querySelector('iframe.vframe') || root.querySelector('iframe[name="vframe"]');
  if (vframe?.getAttribute('src'))
    streams.push({ label: 'Main', embedUrl: abs(vframe.getAttribute('src')!, episodeUrl) });

  for (const btn of root.querySelectorAll('.play-select')) {
    const u = btn.getAttribute('url');
    if (u) streams.push({ label: btn.text.trim() || '分流', embedUrl: abs(u, episodeUrl) });
  }

  const other = root.querySelector('#other');
  if (other) {
    other.querySelectorAll('iframe').forEach((ifr, i) => {
      const s = ifr.getAttribute('src');
      if (s) streams.push({ label: `分流 ${i + 1}`, embedUrl: abs(s, episodeUrl) });
    });
  }

  if (streams.length === 0) {
    const any = root.querySelector('iframe');
    if (any?.getAttribute('src'))
      streams.push({ label: 'Embed', embedUrl: abs(any.getAttribute('src')!, episodeUrl) });
  }

  const nextA = root.querySelectorAll('a').find((a) => a.text.trim() === '下一集');
  const nextHref = nextA?.getAttribute('href');
  const nextUrl = nextHref && nextHref !== '#' ? abs(nextHref, episodeUrl) : null;

  return {
    streams,
    nextUrl: nextUrl && nextUrl !== episodeUrl ? nextUrl : null,
    prevUrl: buildPrevUrl(episodeUrl),
    episodeNo: episodeNo(episodeUrl),
  };
}

// ---------- 深入解析播放器頁 → 取得 .m3u8 / .mp4 ----------
export async function resolveSource(embedUrl: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  try {
    const html = await fetchHtml(embedUrl);
    const root = parse(html);

    const video = root.querySelector('video');
    if (video) {
      let src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
      if (src) return abs(src, embedUrl);
    }

    const iframe = root.querySelector('iframe');
    if (iframe?.getAttribute('src'))
      return await resolveSource(abs(iframe.getAttribute('src')!, embedUrl), depth + 1);

    for (const a of root.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (/\.(m3u8|mp4|webm)/.test(h)) return abs(h, embedUrl);
    }

    const m = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (m) return m[1];

    return null;
  } catch {
    return null;
  }
}

export function isPlayable(url: string | null): boolean {
  return !!url && (/\.(mp4|webm)(\?|$)/.test(url) || url.includes('.m3u8'));
}
