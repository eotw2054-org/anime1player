// lib/sources/types.ts —— Player ↔ 來源 plugin 之間唯一嘅合約。
// App 唔再直接認得任何具體來源,只透過 SourceProvider 同 registry。
import { type Anime, type EpisodeInfo, type Stream } from '../anime1';
import { type Chapter } from '../types';
import { type AdRange } from '../adskip';

export type { Anime, Chapter, EpisodeInfo, Stream, AdRange };

/** 套戲層「線路」：唔同線路各自一套集數（anime1 得 1 條；gimy 將來多條）。 */
export interface PlayLine {
  label: string;
  episodes: Chapter[];
}

/** resolveStream 結果：直接播放網址 + optional 播放 headers（例 anime1.me 需要 Cookie）。 */
export interface StreamResult {
  url: string;
  headers?: Record<string, string>;
}

export interface SourceProvider {
  id: string;
  label: string;
  /**
   * 取名單。anime1 有 in/one/cc 鏡像,故收一個 `site`（完整域名）；
   * 階段 1–3 鏡像 loop 仍喺 App,逐個 site 叫。將來 server 搜尋型來源用 `search`。
   */
  loadCatalog(site?: string): Promise<Anime[]>;
  search?(q: string, page?: number): Promise<Anime[]>;
  /** 套戲 → 線路（每條一套集數）。anime1 回單一線路。 */
  getEpisodes(a: Anime): Promise<PlayLine[]>;
  /** 集數頁 → 候選播放器來源（未解析）+ 上/下集。 */
  getEpisode(url: string): Promise<EpisodeInfo>;
  /** 候選 embed → 拆到底嘅直接 .m3u8/.mp4 網址（player 只食直接網址）。
   * 可回純網址,或 StreamResult（連播放需要嘅 headers,例 anime1.me 嘅 Cookie）。 */
  resolveStream(embedUrl: string): Promise<string | StreamResult | null>;
  /** 廣告偵測（optional，source-specific）。唔實作就自動唔跳,唔會誤跳真內容。 */
  adDetector?(m3u8Url: string, headers?: Record<string, string>): Promise<AdRange[]>;
}
