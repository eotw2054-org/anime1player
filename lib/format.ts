// lib/format.ts —— 純格式化 / 識別 helper（無 React、無網絡，易 test）

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 收藏 / 進度 / 標記嘅統一 key：站台 + slug */
export const favKey = (a: { site: string; slug: string }) => a.site + '|' + a.slug;

/** 秒數 → m:ss */
export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s2 = Math.floor(sec % 60);
  return `${m}:${s2 < 10 ? '0' : ''}${s2}`;
}
