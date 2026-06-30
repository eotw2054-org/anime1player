// lib/sources/registry.ts —— 由 anime / site 解析返對應 provider。
// 暫時只此一家(anime1),揾唔到一律 fallback anime1Provider。將來多來源改顯式 providerId。
import { type Anime } from '../anime1';
import { type SourceProvider } from './types';
import { anime1Provider } from './anime1';

export const providers: Record<string, SourceProvider> = {
  anime1: anime1Provider,
};

/** 由站台域名解析 provider（loadCatalog 用,嗰陣未有 Anime）。 */
export function getProviderBySite(_site: string): SourceProvider {
  // 只此一家;將來:Object.values(providers).find(p => p.ownsSite?.(site)) ?? anime1Provider
  return anime1Provider;
}

/** 由 Anime 解析 provider（用 anime.site）。 */
export function getProvider(a: Anime): SourceProvider {
  return getProviderBySite(a.site);
}
