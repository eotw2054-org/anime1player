// lib/catalog.ts —— 側欄清單分組 / 集數分段嘅純邏輯（無 React，易 test）。
import { type Anime, SITES } from './anime1';
import { type SiteKey, type Tab, type Chapter } from './types';
import { favKey } from './format';

/** 同名(正規化後)跨來源併成一組,清單一行顯示多個來源。 */
export interface AnimeGroup {
  key: string;       // 正規化名（fallback favKey）
  primary: Anime;    // 代表（有真年份/資料較全嗰個）
  sources: Anime[];  // 全部來源,primary 在前
}
export interface Section {
  title: string;
  data: AnimeGroup[];
}
export interface EpBucket {
  start: number;
  end: number;
  label: string;
}

/** 片名正規化:去空白 + 去尾綴(動漫/動畫/線上看) + 小寫 → 跨來源同名歸一。 */
export function normalizeName(name: string): string {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/(動漫|動畫|線上看)+$/g, '')
    .toLowerCase();
}

const hasRealYear = (a: Anime) => /20\d\d/.test(a.updateYear);

/** 由 anime list 併成同名分組,保留出現次序;primary 揀有真年份嗰個(否則第一個)。 */
export function groupAnimes(animes: Anime[]): AnimeGroup[] {
  const map = new Map<string, Anime[]>();
  const order: string[] = [];
  for (const a of animes) {
    const key = normalizeName(a.name) || favKey(a);
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(a);
  }
  return order.map((key) => {
    const arr = map.get(key)!;
    // 排序:有真年份優先 → 短名優先(「天命」勝「天命動漫」);再每個 site 只留一個(同站唔重複)
    const sorted = [...arr].sort((x, y) => {
      const ry = (hasRealYear(x) ? 0 : 1) - (hasRealYear(y) ? 0 : 1);
      return ry || x.name.length - y.name.length;
    });
    const sources: Anime[] = [];
    const seenSite = new Set<string>();
    for (const a of sorted) {
      if (seenSite.has(a.site)) continue;
      seenSite.add(a.site);
      sources.push(a);
    }
    return { key, primary: sources[0], sources };
  });
}

/**
 * 由各站清單 + 篩選條件，整出側欄要顯示嘅分組。
 * - 「最愛」分頁：單一分組（或空）。
 * - 「全部」分頁：合併已啟用站台 → 去重（site|slug）→ 搜尋過濾 → 按更新年份分組（新→舊，「其他」包尾）。
 */
export function buildSections(
  lists: Record<string, Anime[]>,
  enabledSites: Record<string, boolean>,
  favorites: Anime[],
  query: string,
  tab: Tab,
): Section[] {
  const q = query.trim().toLowerCase();

  if (tab === 'fav') {
    // 收藏 = 記住戲名(唔記邊個 source)→ 用全目錄(所有站)補齊每套嘅所有來源
    const favNames = new Set(favorites.map((a) => normalizeName(a.name) || favKey(a)));
    const pool: Anime[] = [];
    const seenK = new Set<string>();
    const add = (a: Anime) => {
      const k = favKey(a);
      if (!seenK.has(k)) { seenK.add(k); pool.push(a); }
    };
    favorites.forEach(add);
    for (const s of Object.keys(SITES) as SiteKey[]) {
      for (const a of lists[s] ?? []) if (favNames.has(normalizeName(a.name) || favKey(a))) add(a);
    }
    const filteredFav = pool.filter((a) => !q || a.search.includes(q) || a.slug.includes(q));
    const groupedFav = groupAnimes(filteredFav).filter((g) => favNames.has(g.key));
    return groupedFav.length ? [{ title: '★ 我的最愛', data: groupedFav }] : [];
  }

  // 「全部」分頁:已啟用站台 → 去重 → 搜尋 → 同名分組 → 按 primary 年份分組
  const src = (Object.keys(SITES) as SiteKey[]).filter((s) => enabledSites[s]).flatMap((s) => lists[s] ?? []);
  const seen = new Set<string>();
  const deduped = src.filter((a) => {
    const k = favKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const filtered = deduped.filter((a) => !q || a.search.includes(q) || a.slug.includes(q));
  const grouped = groupAnimes(filtered); // 同名跨來源併行
  const groups: Record<string, AnimeGroup[]> = {};
  grouped.forEach((g) => {
    (groups[g.primary.updateYear] ||= []).push(g);
  });
  return Object.keys(groups)
    .sort((x, y) => (y === '其他' ? -1 : x === '其他' ? 1 : Number(y) - Number(x)))
    .map((yr) => ({ title: yr === '其他' ? '其他' : `${yr} 年更新`, data: groups[yr] }));
}

/** 集數超過 bucketSize 就分頁（例：1–50 / 51–100…）；唔夠就回 []（唔分頁）。 */
export function buildEpBuckets(chapters: Chapter[], bucketSize: number): EpBucket[] {
  if (chapters.length <= bucketSize) return [];
  const out: EpBucket[] = [];
  for (let i = 0; i < chapters.length; i += bucketSize) {
    const end = Math.min(i + bucketSize, chapters.length);
    out.push({ start: i, end, label: `${chapters[i].ep}–${chapters[end - 1].ep}` });
  }
  return out;
}
