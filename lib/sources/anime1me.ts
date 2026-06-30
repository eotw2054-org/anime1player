// lib/sources/anime1me.ts —— anime1.me（正源）作為一個 SourceProvider。
// 同 .in/.one/.cc 鏡像結構完全唔同：
//   目錄  = animelist.json（[catId,name,集數,年,季,字幕組]，catId===0 為 18+ → 隔走）
//   戲頁  = /?cat=<catId> 分類頁，每集一個 <article id="post-N">
//   播放  = <video data-apireq="{c,e,t,p,s}"> → POST v.anime1.me/api（需 .anime1.me cookie）→ 直接 mp4
//   廣告  = 同 anicdn，共用 getAdRanges
import { parse } from 'node-html-parser';
import { type SourceProvider, type PlayLine } from './types';
import { type Anime, type EpisodeInfo, type Stream } from '../anime1';
import { type Chapter } from '../types';
import { getAdRanges } from '../adskip';
import { UA } from '../format';

export const SITE = 'https://anime1.me';
const CATALOG_URL = SITE + '/animelist.json';
const API_URL = 'https://v.anime1.me/api';

function abs(path: string, base = SITE): string {
  if (!path) return path;
  if (path.startsWith('//')) return 'https:' + path;
  try { return new URL(path, base).href; } catch { return path; }
}

function stripTags(s: string): string {
  return String(s ?? '').replace(/<[^>]+>/g, '').trim();
}

/** 由標題「名稱 [13]」抽集號;抽唔到回 '?'。 */
export function episodeNoFromTitle(title: string): string {
  const m = String(title).match(/\[([^\]]+)\]\s*$/);
  return m ? m[1].trim() : '?';
}

// ---------- 目錄：animelist.json rows → Anime[]（隔走 18+）----------
/** row = [catId, nameHtml, 集數, 年, 季, 字幕組]。catId===0 = 18+（連 anime1.pw）→ 隔走。 */
export function mapCatalog(rows: any[]): Anime[] {
  if (!Array.isArray(rows)) return [];
  const out: Anime[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 2) continue;
    const catId = r[0];
    if (catId === 0 || catId === '0') continue; // 18+ 隔走（信號用 catId，唔 hardcode 數量）
    const name = stripTags(r[1]);
    if (!name) continue;
    const cntText = String(r[2] ?? '').trim();
    const year = String(r[3] ?? '').trim();
    const season = String(r[4] ?? '').trim();
    const sub = String(r[5] ?? '').trim();
    const numMatch = cntText.match(/(\d+)/);
    out.push({
      site: SITE,
      slug: String(catId),
      name,
      num: numMatch ? parseInt(numMatch[1], 10) : null,
      cntText,
      latestUrl: `${SITE}/?cat=${catId}`,
      update: [year, season].filter(Boolean).join(' '),
      updateYear: (year.match(/(20\d\d)/) || [])[1] || '其他',
      search: (name + ' ' + sub).toLowerCase(),
    });
  }
  return out;
}

// ---------- 分類頁 → 集數（單一線路）----------
/** 由 /?cat= 分類頁 HTML 收集集數（h2.entry-title a → /<postId> + [NN]），由舊到新排序。 */
export function parseEpisodeList(html: string, base = SITE): Chapter[] {
  const root = parse(html);
  const items: { ep: number; url: string }[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll('h2.entry-title a')) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href) continue;
    const url = abs(href, base);
    if (seen.has(url)) continue;
    seen.add(url);
    const noText = episodeNoFromTitle(a.text);
    const epNum = parseFloat(noText);
    items.push({ ep: isNaN(epNum) ? items.length + 1 : epNum, url });
  }
  // 分類頁新→舊;轉成舊→新（ep1 first）。集號抽到就照集號,否則維持出現次序。
  const allHaveNo = items.every((x) => !isNaN(x.ep));
  const ordered = allHaveNo ? [...items].sort((a, b) => a.ep - b.ep) : [...items].reverse();
  return ordered.map((x, i) => ({ ep: i + 1, url: x.url }));
}

/** 由分類頁找「更舊文章」分頁連結（WordPress archive），用嚟抓齊長番。 */
function nextArchivePage(html: string, base: string): string | null {
  const root = parse(html);
  // .nav-previous = 更舊（更前集）;亦試 a.page-numbers.next
  const older =
    root.querySelector('.nav-previous a') ||
    root.querySelector('.nav-links a.next') ||
    root.querySelector('a.next.page-numbers');
  const href = older?.getAttribute('href');
  return href ? abs(href, base) : null;
}

// ---------- 集數頁 → 候選 stream + 上/下集 ----------
export function parseApireq(html: string): string | null {
  const m = html.match(/data-apireq="([^"]+)"/);
  return m ? m[1] : null;
}

/** 由集數頁抽「上一集/下一集」→ /?p=<id>;空（最新/最舊）回 null。 */
export function parseAdjacent(html: string, base = SITE): { prevUrl: string | null; nextUrl: string | null } {
  const root = parse(html);
  let prevUrl: string | null = null;
  let nextUrl: string | null = null;
  for (const a of root.querySelectorAll('a')) {
    const t = a.text.trim();
    const href = (a.getAttribute('href') || '').trim();
    if (!href || !/\d/.test(href)) continue; // 空 /?p= 唔計
    if (t.includes('上一集') || t.includes('上一話')) prevUrl = abs(href, base);
    else if (t.includes('下一集') || t.includes('下一話')) nextUrl = abs(href, base);
  }
  return { prevUrl, nextUrl };
}

/** player API 回應 {s:[{src,type}]} → 直接可播網址。 */
export function parseApiSource(json: any): string | null {
  const src = json?.s?.[0]?.src;
  return src ? abs(String(src)) : null;
}

async function postApi(apireq: string): Promise<any | null> {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Referer: SITE + '/',
    },
    body: 'd=' + apireq, // apireq 本身已 url-encoded
  });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: SITE + '/', Accept: 'text/html,*/*' },
  });
  return await r.text();
}

export const anime1meProvider: SourceProvider = {
  id: 'anime1me',
  label: 'anime1.me',

  async loadCatalog() {
    const r = await fetch(CATALOG_URL, { headers: { 'User-Agent': UA, Referer: SITE + '/' } });
    const rows = await r.json();
    return mapCatalog(rows);
  },

  async getEpisodes(a: Anime): Promise<PlayLine[]> {
    const catId = a.slug;
    let url: string | null = `${SITE}/?cat=${catId}`;
    const collected: Chapter[] = [];
    const seenPages = new Set<string>();
    // 跟分頁抓齊（cap 防無限循環）
    for (let guard = 0; url && guard < 25 && !seenPages.has(url); guard++) {
      seenPages.add(url);
      const html = await fetchHtml(url);
      collected.push(...parseEpisodeList(html, SITE));
      url = nextArchivePage(html, SITE);
    }
    // 去重 + 重新編號（多頁合併後保持舊→新）
    const seen = new Set<string>();
    const episodes = collected
      .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
      .map((c, i) => ({ ep: i + 1, url: c.url }));
    const fallback = episodes.length ? episodes : [{ ep: 1, url: a.latestUrl }];
    return [{ label: '預設', episodes: fallback }];
  },

  async getEpisode(url: string): Promise<EpisodeInfo> {
    const html = await fetchHtml(url);
    const titleEl = parse(html).querySelector('h2.entry-title');
    const episodeNo = episodeNoFromTitle(titleEl?.text || '');
    const { prevUrl, nextUrl } = parseAdjacent(html, SITE);
    // 單一候選：embedUrl = 集數頁本身;resolveStream 會即時 re-fetch 攞新鮮 apireq（連 cookie）。
    const streams: Stream[] = [{ label: 'Main', embedUrl: url }];
    return { streams, prevUrl, nextUrl, episodeNo };
  },

  async resolveStream(embedUrl: string): Promise<string | null> {
    // 重新攞集數頁 → 新鮮 apireq（+ 確保 .anime1.me cookie 已設）→ POST API → mp4
    const html = await fetchHtml(embedUrl);
    const apireq = parseApireq(html);
    if (!apireq) return null;
    const json = await postApi(apireq);
    return parseApiSource(json);
  },

  adDetector: (m3u8Url, headers) => getAdRanges(m3u8Url, headers),
};
