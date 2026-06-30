import { type Anime, SITES } from './anime1';

export type SiteKey = keyof typeof SITES;
export type Tab = 'all' | 'fav';

export interface Chapter {
  ep: number;
  url: string;
}

export interface Current {
  anime: Anime;
  episodeUrl: string;
  episodeNo: string;
  streams: { label: string; embedUrl: string; ms?: number }[];
  streamIndex: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

export interface Progress {
  url: string;
  ep: string;
  time: number;
  at?: number;
}

/** 逐套動畫嘅片頭/片尾標記（秒）。key = favKey(site|slug） */
export interface Mark {
  start?: number;
  end?: number;
  at?: number;
}
export type Marks = Record<string, Mark>;
