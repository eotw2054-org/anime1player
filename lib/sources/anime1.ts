// lib/sources/anime1.ts —— anime1 包成第一個 SourceProvider（純搬,行為不變）。
import { type SourceProvider, type PlayLine } from './types';
import {
  type Anime,
  SITES,
  fetchHtml,
  parseHomeList,
  buildChapters,
  parseEpisode,
  resolveSource,
} from '../anime1';
import { type Chapter } from '../types';
import { getAdRanges } from '../adskip';

export const anime1Provider: SourceProvider = {
  id: 'anime1',
  label: 'anime1',

  async loadCatalog(site = SITES.in) {
    const html = await fetchHtml(site + '/');
    return parseHomeList(html, site);
  },

  // 兩條路（同 App.openAnime 一致）：a.num 快速算網址；否則 fetch 詳情頁 regex；空 fallback latestUrl。
  async getEpisodes(a: Anime): Promise<PlayLine[]> {
    if (a.num && a.num > 0 && a.num <= 2000) {
      return [{ label: '預設', episodes: buildChapters(a.site, a.slug, a.num) }];
    }
    try {
      const html = await fetchHtml(a.site + '/' + a.slug + '/');
      const re = new RegExp('href="(/' + a.slug + '-[0-9a-z-]+)"', 'g');
      const seen = new Set<string>();
      const out: Chapter[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          out.push({ ep: out.length + 1, url: a.site + m[1] });
        }
      }
      const episodes = out.length ? out : [{ ep: 1, url: a.latestUrl }];
      return [{ label: '預設', episodes }];
    } catch {
      return [{ label: '預設', episodes: [{ ep: 1, url: a.latestUrl }] }];
    }
  },

  getEpisode: (url) => parseEpisode(url),
  resolveStream: (embedUrl) => resolveSource(embedUrl),
  adDetector: (m3u8Url, headers) => getAdRanges(m3u8Url, headers),
};
