// lib/catalog.ts —— 側欄清單分組 / 集數分段嘅純邏輯（無 React，易 test）。
import { type Anime, SITES } from './anime1';
import { type SiteKey, type Tab, type Chapter } from './types';
import { favKey } from './format';

export interface Section {
  title: string;
  data: Anime[];
}
export interface EpBucket {
  start: number;
  end: number;
  label: string;
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
  const src =
    tab === 'fav'
      ? favorites
      : (Object.keys(SITES) as SiteKey[]).filter((s) => enabledSites[s]).flatMap((s) => lists[s] ?? []);
  const seen = new Set<string>();
  const deduped = src.filter((a) => {
    const k = favKey(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const filtered = deduped.filter((a) => !q || a.search.includes(q) || a.slug.includes(q));
  if (tab === 'fav') {
    return filtered.length ? [{ title: '★ 我的最愛', data: filtered }] : [];
  }
  const groups: Record<string, Anime[]> = {};
  filtered.forEach((a) => {
    (groups[a.updateYear] ||= []).push(a);
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
