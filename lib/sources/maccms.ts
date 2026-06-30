// lib/sources/maccms.ts —— config-driven MacCMS provider 工廠。
// 一份邏輯 + 兩個 template profile,覆蓋多個 Gimy 鏡像（將來轉域/新站 = 加一份 config）：
//   Profile A（MacCMS 預設主題）：gimytv.biz / gimytw.net
//     分類 /vodshow/<t>--------<p>---.html · 詳情 /voddetail/<id>.html · 集 /video/<id>-<ep>.html#sid · 列表 a.video-pic
//   Profile B（gimyt "card" 主題）：gimyplus.com / gimypro.com
//     分類 /show/<t>--------<p>---.html · 詳情 /vod/<id>.html · 集 /ep/<id>-<sid>-<ep>.html · 列表 a.card__thumb
// 最深層共用：player_aaaa（extractPlayerConfig + decodePlayUrl），同「揀直接 m3u8 線路、跳過外部源(qq/愛奇藝…)」。
import { parse } from 'node-html-parser';
import { type SourceProvider, type PlayLine } from './types';
import { type Anime } from '../anime1';
import { type Chapter } from '../types';
import { UA } from '../format';

const MAX_PAGES = 5; // 載最新幾頁(~300 套),有 cache,夠瀏覽

/** 外部源（唔係直接 m3u8,要解析器,播唔到）→ 線路排序時擺後 / 跳過。 */
export const EXTERNAL_SOURCE = /騰訊|qq|愛奇藝|奇藝|iqiyi|優酷|优酷|youku|芒果|mgtv|嗶哩|哔哩|bilibili|b站|樂視|乐视|letv|搜狐|sohu|pptv|1905/i;

export interface MacCmsProfile {
  listPrefix: string;       // '/vodshow' | '/show'
  detailPrefix: string;     // '/voddetail' | '/vod'
  itemSelector: string;     // 'a.video-pic' | 'a.card__thumb'
  detailRe: RegExp;         // 抽 detail id
  titleAttr: string;        // 'title' | 'aria-label'
  noteSelector: string;     // '.note' | '.card__badge'
  lineSelector: string;     // '.playlist' | '.playlist-block'
  lineTitleSelector: string | null; // null（A,無線路名）| '.playlist-block__title'
  epAnchorSelector: string; // 'a[href*="/video/"]' | 'a[href*="/ep/"]'
  stripHash: boolean;       // A: true（去 #sid）| B: false（sid 喺路徑）
}

export const PROFILE_A: MacCmsProfile = {
  listPrefix: '/vodshow', detailPrefix: '/voddetail', itemSelector: 'a.video-pic',
  detailRe: /\/voddetail\/(\d+)\.html/, titleAttr: 'title', noteSelector: '.note',
  lineSelector: '.playlist', lineTitleSelector: null, epAnchorSelector: 'a[href*="/video/"]', stripHash: true,
};
export const PROFILE_B: MacCmsProfile = {
  listPrefix: '/show', detailPrefix: '/vod', itemSelector: 'a.card__thumb',
  detailRe: /\/vod\/(\d+)\.html/, titleAttr: 'aria-label', noteSelector: '.card__badge',
  lineSelector: '.playlist-block', lineTitleSelector: '.playlist-block__title', epAnchorSelector: 'a[href*="/ep/"]', stripHash: false,
};

export interface MacCmsConfig {
  id: string;
  label: string;
  base: string;
  animeType: number;
  profile: 'A' | 'B';
}

function abs(path: string, base: string): string {
  if (!path) return path;
  if (path.startsWith('//')) return 'https:' + path;
  try { return new URL(path, base).href; } catch { return path; }
}

async function fetchHtml(url: string, base: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: base + '/', Accept: 'text/html,*/*' } });
  return await r.text();
}

function episodeNoFromUrl(url: string): string {
  const m = url.match(/-(\d+)\.html(?:[#?].*)?$/);
  return m ? m[1] : '?';
}

// ---------- 目錄 ----------
export function parseCatalog(html: string, profile: MacCmsProfile, base: string): Anime[] {
  const root = parse(html);
  const out: Anime[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll(profile.itemSelector)) {
    const href = a.getAttribute('href') || '';
    const m = href.match(profile.detailRe);
    if (!m) continue;
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const name = (a.getAttribute(profile.titleAttr) || '').trim();
    if (!name) continue;
    const note = (a.querySelector(profile.noteSelector)?.text || '').trim().replace('更新更新', '更新');
    const numMatch = note.match(/(\d+)/);
    out.push({
      site: base, slug, name,
      num: numMatch ? parseInt(numMatch[1], 10) : null,
      cntText: note,
      latestUrl: `${base}${profile.detailPrefix}/${slug}.html`,
      update: '', updateYear: '其他',
      search: name.toLowerCase(),
    });
  }
  return out;
}

// ---------- 詳情 → 線路（PlayLine[]，m3u8 線路排前，外部源排後）----------
export function parseEpisodes(html: string, profile: MacCmsProfile, base: string): PlayLine[] {
  const root = parse(html);
  const lines: PlayLine[] = [];
  for (const block of root.querySelectorAll(profile.lineSelector)) {
    const label = profile.lineTitleSelector
      ? (block.querySelector(profile.lineTitleSelector)?.text || '').trim()
      : '預設';
    const eps: Chapter[] = [];
    const seen = new Set<string>();
    for (const a of block.querySelectorAll(profile.epAnchorSelector)) {
      let href = a.getAttribute('href') || '';
      if (profile.stripHash) href = href.split('#')[0];
      const url = abs(href, base);
      const m = url.match(/-(\d+)\.html/);
      if (!m || seen.has(url)) continue;
      seen.add(url);
      eps.push({ ep: parseInt(m[1], 10), url });
    }
    if (eps.length) {
      eps.sort((x, y) => x.ep - y.ep);
      lines.push({ label: label || '線路', episodes: eps });
    }
  }
  // 去重：profile A 多條線路 strip #sid 後集數一模一樣 → 收埋做一條（免「分流選擇」出一堆「預設」）
  const uniq: PlayLine[] = [];
  const seenSig = new Set<string>();
  for (const ln of lines) {
    const sig = `${ln.episodes[0]?.url}|${ln.episodes.length}|${ln.episodes[ln.episodes.length - 1]?.url}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    uniq.push(ln);
  }
  // 外部源（qq/愛奇藝…播唔到）排後 → lines[0] 係可播 m3u8 線路
  uniq.sort((a, b) => (EXTERNAL_SOURCE.test(a.label) ? 1 : 0) - (EXTERNAL_SOURCE.test(b.label) ? 1 : 0));
  return uniq;
}

// ---------- player config（profile A 用 player_aaaa,profile B 用 player_data）----------
/** 試齊已知 player 變數名,brace-match 抽 JSON,回第一個有 `url` 嘅。 */
export function extractPlayerConfig(html: string, varNames: string[] = ['player_aaaa', 'player_data']): any | null {
  for (const v of varNames) {
    let from = 0;
    while (true) {
      const at = html.indexOf(v, from);
      if (at < 0) break;
      from = at + v.length;
      const start = html.indexOf('{', at);
      if (start < 0) break;
      let depth = 0;
      let end = -1;
      for (let j = start; j < html.length; j++) {
        const c = html[j];
        if (c === '{') depth++;
        else if (c === '}') { if (--depth === 0) { end = j + 1; break; } }
      }
      if (end < 0) break;
      try {
        const parsed = JSON.parse(html.slice(start, end));
        if (parsed && typeof parsed === 'object' && 'url' in parsed) return parsed;
      } catch { /* try next occurrence / var */ }
    }
  }
  return null;
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

/** 真‧可直接播：http(s) + .m3u8/.mp4/.webm。排除 parser-only token（JD-…/NS-…）。 */
export function isDirectPlayable(u: string | null): boolean {
  return !!u && /^https?:/i.test(u) && (u.includes('.m3u8') || /\.(mp4|webm)(\?|$)/.test(u));
}

/** 解一條集數頁 → 直接播放網址（resolveStream + 探測共用）。 */
async function resolvePlayUrl(epUrl: string, base: string): Promise<string | null> {
  const html = await fetchHtml(epUrl, base);
  const c = extractPlayerConfig(html);
  if (!c?.url) return null;
  return decodePlayUrl(String(c.url), c.encrypt);
}

/**
 * 揀第一條「解到真 m3u8」嘅線路做預設。
 * gimyplus 把 parser-only 線路扮成「4K/藍光」高清,label 呃唔到 → 必須靠解析後嘅 url shape。
 * 並行探測頭幾條(每條第一集),揀返原順序最前嗰條 playable 嘅,擺去 lines[0]。
 */
async function pickPlayableFirst(lines: PlayLine[], base: string): Promise<PlayLine[]> {
  if (lines.length <= 1) return lines;
  const cap = 6;
  const cand = lines.slice(0, cap);
  const checks = await Promise.all(
    cand.map(async (ln) => {
      try { return isDirectPlayable(await resolvePlayUrl(ln.episodes[0]?.url, base)); }
      catch { return false; }
    })
  );
  const idx = checks.findIndex(Boolean);
  if (idx > 0) { const [good] = lines.splice(idx, 1); lines.unshift(good); }
  return lines;
}

// ---------- 工廠 ----------
export function createMacCmsProvider(cfg: MacCmsConfig): SourceProvider {
  const profile = cfg.profile === 'A' ? PROFILE_A : PROFILE_B;
  const base = cfg.base;
  const pageUrl = (p: number) => `${base}${profile.listPrefix}/${cfg.animeType}--------${p <= 1 ? '' : p}---.html`;

  return {
    id: cfg.id,
    label: cfg.label,

    async loadCatalog() {
      const all: Anime[] = [];
      const seen = new Set<string>();
      for (let p = 1; p <= MAX_PAGES; p++) {
        let items: Anime[] = [];
        try {
          items = parseCatalog(await fetchHtml(pageUrl(p), base), profile, base);
        } catch (e) { if (__DEV__) console.warn(e); break; }
        if (!items.length) break;
        for (const a of items) if (!seen.has(a.slug)) { seen.add(a.slug); all.push(a); }
      }
      return all;
    },

    async getEpisodes(a: Anime): Promise<PlayLine[]> {
      const html = await fetchHtml(`${base}${profile.detailPrefix}/${a.slug}.html`, base);
      const lines = parseEpisodes(html, profile, base);
      if (!lines.length) return [{ label: '預設', episodes: [{ ep: 1, url: a.latestUrl }] }];
      return pickPlayableFirst(lines, base); // 預設線路揀「解到真 m3u8」嗰條（label 呃唔到）
    },

    async getEpisode(url: string) {
      const html = await fetchHtml(url, base);
      const cfg2 = extractPlayerConfig(html);
      const strip = (u?: string): string | null => {
        if (!u) return null;
        return abs(profile.stripHash ? u.split('#')[0] : u, base);
      };
      const nextUrl = strip(cfg2?.link_next);
      const prevUrl = strip(cfg2?.link_pre);
      return {
        streams: [{ label: 'Main', embedUrl: url }],
        nextUrl: nextUrl && nextUrl !== url ? nextUrl : null,
        prevUrl,
        episodeNo: episodeNoFromUrl(url),
      };
    },

    async resolveStream(embedUrl: string): Promise<string | null> {
      return resolvePlayUrl(embedUrl, base);
    },
    // adDetector 唔設：CDN 同 anime1 唔同。
  };
}

// ---------- Gimy 鏡像 configs（gimyplus 做主）----------
// 註:gimypro.com 係另一個 fork(Pro版),路由完全唔同(/browse 列表、/title 詳情、/watch 集數),
// 等於要第三個 profile,暫時唔收;若主來源失效再投資整 profile C。
export const GIMY_CONFIGS: MacCmsConfig[] = [
  { id: 'gimyplus', label: 'gimyplus（動漫·主）', base: 'https://gimyplus.com', animeType: 4, profile: 'B' },
  { id: 'gimytv', label: 'GimyTV（動漫）', base: 'https://gimytv.biz', animeType: 4, profile: 'A' },
  { id: 'gimytw', label: 'GimyTW（動漫）', base: 'https://gimytw.net', animeType: 4, profile: 'A' },
];

export const gimyProviders = GIMY_CONFIGS.map((cfg) => ({ cfg, provider: createMacCmsProvider(cfg) }));

/** 由站台 URL 認返對應 Gimy provider（id 同二級域名一致,如 gimyplus.com 含 'gimyplus'）。 */
export function matchGimyProvider(site: string): SourceProvider | null {
  const s = String(site || '');
  const hit = gimyProviders.find((g) => s.includes(g.cfg.id));
  return hit ? hit.provider : null;
}
