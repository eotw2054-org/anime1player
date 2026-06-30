// lib/sources/registry.ts —— 由 anime / site 解析返對應 provider。
// 暫時只此一家(anime1),揾唔到一律 fallback anime1Provider。將來多來源改顯式 providerId。
import { type Anime } from '../anime1';
import { type SourceProvider } from './types';
import { anime1Provider } from './anime1';
import { anime1meProvider } from './anime1me';

export const providers: Record<string, SourceProvider> = {
  anime1: anime1Provider,
  anime1me: anime1meProvider,
};

/** 由站台域名解析 provider（loadCatalog 用,嗰陣未有 Anime）。 */
export function getProviderBySite(site: string): SourceProvider {
  // anime1.me（正源）結構同 .in/.one/.cc 鏡像完全唔同 → 獨立 provider。
  if (typeof site === 'string' && site.includes('anime1.me')) return anime1meProvider;
  return anime1Provider;
}

/** 由 Anime 解析 provider（用 anime.site）。 */
export function getProvider(a: Anime): SourceProvider {
  return getProviderBySite(a.site);
}
