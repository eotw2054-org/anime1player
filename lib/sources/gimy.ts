// lib/sources/gimy.ts —— Gimy（gimytv.biz，動漫分類）作為一個 SourceProvider（MVP：單線路、無搜尋）。
// 標準 MacCMS V10,全 server-rendered：
//   目錄(動漫) = /vodshow/4--------<page>---.html → li items（a.video-pic[href=/voddetail/<id>.html]）
//   詳情       = /voddetail/<id>.html → 多條線路,每條 episode link /video/<id>-<ep>.html#sid=<n>
//   播放頁     = /video/<id>-<ep>.html → var player_aaaa={...}: encrypt + url(直接 m3u8) + link_pre/link_next
//   m3u8       = 第三方 CDN,完全開放(無 Referer/cookie),expo-video 直接播 HLS
// 注意：#sid 係 client-side fragment,server 睇唔到 → /video/<id>-<ep>.html 永遠回預設線路(MVP 夠用)。
// 域名會轉(gimytv.biz),當鏡像咁將來可能要改 SITE。
import { parse } from 'node-html-parser';
import { type SourceProvider, type PlayLine } from './types';
import { type Anime } from '../anime1';
import { type Chapter } from '../types';
import { UA } from '../format';

export const SITE = 'https://gimytv.biz';
const ANIME_TYPE = 4; // vodtype 4 = 動漫
const MAX_PAGES = 5; // MVP：載最新幾頁(~300 套),有 cache,夠瀏覽

function abs(path: string, base = SITE): string {
  if (!path) return path;
  if (path.startsWith('//')) return 'https:' + path;
  try { return new URL(path, base).href; } catch { return path; }
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: SITE + '/', Accept: 'text/html,*/*' } });
  return await r.text();
}

/** 動漫分類分頁 URL（page 1 = 空 slot）。 */
export function catalogPageUrl(page: number, base = SITE): string {
  return `${base}/vodshow/${ANIME_TYPE}--------${page <= 1 ? '' : page}---.html`;
}

// ---------- 目錄頁 → Anime[] ----------
export function parseCatalog(html: string, base = SITE): Anime[] {
  const root = parse(html);
  const out: Anime[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll('a.video-pic')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/voddetail\/(\d+)\.html/);
    if (!m) continue;
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const name = (a.getAttribute('title') || '').trim();
    if (!name) continue;
    const note = (a.querySelector('.note')?.text || '').trim().replace('更新更新', '更新'); // 模板重複「更新」前綴
    const numMatch = note.match(/(\d+)/);
    out.push({
      site: base,
      slug,
      name,
      num: numMatch ? parseInt(numMatch[1], 10) : null,
      cntText: note,
      latestUrl: `${base}/voddetail/${slug}.html`,
      update: '',
      updateYear: '其他', // 目錄頁冇年份 → 歸「其他」組
      search: name.toLowerCase(),
    });
  }
  return out;
}

// ---------- 詳情頁 → 集數（MVP：取第一條線路,單一 PlayLine）----------
export function parseEpisodes(html: string, base = SITE): Chapter[] {
  const root = parse(html);
  const block = root.querySelector('.playlist'); // 第一條線路
  if (!block) return [];
  const items: Chapter[] = [];
  const seen = new Set<string>();
  for (const a of block.querySelectorAll('a[href*="/video/"]')) {
    const href = (a.getAttribute('href') || '').split('#')[0]; // 去掉 #sid（client-side）
    const m = href.match(/\/video\/\d+-(\d+)\.html/);
    if (!m) continue;
    const url = abs(href, base);
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ ep: parseInt(m[1], 10), url });
  }
  items.sort((a, b) => a.ep - b.ep);
  return items;
}

// ---------- 播放頁 player_aaaa ----------
/** 由播放頁 HTML 抽 player_aaaa JSON（brace-match,正確 unescape）。 */
export function extractPlayerConfig(html: string): any | null {
  const i = html.indexOf('player_aaaa');
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(start, end)); } catch { return null; }
}

/** 按 encrypt 解 player url：0 原樣 / 1 urldecode / 2 base64(→urldecode)。 */
export function decodePlayUrl(url: string, encrypt: any): string {
  const e = Number(encrypt) || 0;
  try {
    if (e === 1) return decodeURIComponent(url);
    if (e === 2) {
      const b = typeof atob === 'function' ? atob(url) : url;
      try { return decodeURIComponent(b); } catch { return b; }
    }
  } catch (err) { if (__DEV__) console.warn(err); }
  return url;
}

function episodeNoFromUrl(url: string): string {
  const m = url.match(/\/video\/\d+-(\d+)\.html/);
  return m ? m[1] : '?';
}

export const gimyProvider: SourceProvider = {
  id: 'gimy',
  label: 'Gimy',

  async loadCatalog() {
    const all: Anime[] = [];
    const seen = new Set<string>();
    for (let p = 1; p <= MAX_PAGES; p++) {
      let items: Anime[] = [];
      try {
        items = parseCatalog(await fetchHtml(catalogPageUrl(p)), SITE);
      } catch (e) { if (__DEV__) console.warn(e); break; }
      if (!items.length) break; // 冇嘢 = 到尾
      for (const a of items) if (!seen.has(a.slug)) { seen.add(a.slug); all.push(a); }
    }
    return all;
  },

  async getEpisodes(a: Anime): Promise<PlayLine[]> {
    const html = await fetchHtml(`${SITE}/voddetail/${a.slug}.html`);
    const episodes = parseEpisodes(html, SITE);
    const fallback = episodes.length ? episodes : [{ ep: 1, url: a.latestUrl }];
    return [{ label: '預設', episodes: fallback }];
  },

  async getEpisode(url: string) {
    const html = await fetchHtml(url);
    const cfg = extractPlayerConfig(html);
    const stripFrag = (u?: string) => (u ? abs(u.split('#')[0], SITE) : null);
    const nextUrl = stripFrag(cfg?.link_next);
    const prevUrl = stripFrag(cfg?.link_pre);
    return {
      streams: [{ label: 'Main', embedUrl: url }],
      nextUrl: nextUrl && nextUrl !== url ? nextUrl : null,
      prevUrl,
      episodeNo: episodeNoFromUrl(url),
    };
  },

  async resolveStream(embedUrl: string): Promise<string | null> {
    const html = await fetchHtml(embedUrl);
    const cfg = extractPlayerConfig(html);
    if (!cfg?.url) return null;
    return decodePlayUrl(String(cfg.url), cfg.encrypt);
  },
  // adDetector 唔設：gimy CDN 同 anime1 唔同,現有 getAdRanges 唔啱 → 自動唔跳(唔誤跳)。
};
