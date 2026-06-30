// lib/favorites.ts —— 最愛（含 tombstone 軟刪除）嘅純邏輯（無 React / IO，易 test）。
// favAll = key→entry 嘅 map，entry 係 {...anime, at, deleted?}；UI 用嘅 active list 過濾走 deleted。
import { type Anime } from './anime1';
import { favKey } from './format';

export type FavMap = Record<string, any>;

/** array of entries → key→entry map（跳過 falsy）。 */
export function favMapFromArray(arr: any[]): FavMap {
  const map: FavMap = {};
  for (const e of arr) if (e) map[favKey(e)] = e;
  return map;
}

/** 由 favAll map 取出 active（未刪除）清單。 */
export function activeFavorites(map: FavMap): Anime[] {
  return Object.values(map).filter((e: any) => !e.deleted) as Anime[];
}

/**
 * 切換一套動畫嘅最愛狀態，回傳新 map：
 * - 本來係 active → 寫 tombstone（deleted:true，保留 site/slug/at 以便傳播 + 防復活）。
 * - 否則 → 寫返完整 entry。
 */
export function toggleFavEntry(map: FavMap, a: Anime, now: number): FavMap {
  const k = favKey(a);
  const cur = map[k];
  const isActive = cur && !cur.deleted;
  return {
    ...map,
    [k]: isActive ? { site: a.site, slug: a.slug, deleted: true, at: now } : { ...a, at: now },
  };
}
