import {
  parseCatalog,
  parseEpisodes,
  extractPlayerConfig,
  decodePlayUrl,
  isDirectPlayable,
  EXTERNAL_SOURCE,
  PROFILE_A,
  PROFILE_B,
  matchGimyProvider,
  gimyProviders,
} from '../maccms';
import { getProvider, getProviderBySite } from '../registry';
import { type Anime } from '../../anime1';

describe('parseCatalog — profile A (video-pic)', () => {
  const html = `<li><a class="video-pic" href="/voddetail/1564.html" title="仙逆">
    <span class="note">更新更新至147集</span></a></li>`;
  it('maps video-pic item with cleaned note', () => {
    const list = parseCatalog(html, PROFILE_A, 'https://gimytv.biz');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ site: 'https://gimytv.biz', slug: '1564', name: '仙逆', num: 147, cntText: '更新至147集' });
    expect(list[0].latestUrl).toBe('https://gimytv.biz/voddetail/1564.html');
  });
});

describe('parseCatalog — profile B (card)', () => {
  const html = `<article class="card"><a class="card__thumb" href="/vod/245516.html" aria-label="仙逆">
    <span class="card__badge">更新至147集</span></a></article>`;
  it('maps card item via aria-label + card__badge', () => {
    const list = parseCatalog(html, PROFILE_B, 'https://gimyplus.com');
    expect(list[0]).toMatchObject({ site: 'https://gimyplus.com', slug: '245516', name: '仙逆', num: 147 });
    expect(list[0].latestUrl).toBe('https://gimyplus.com/vod/245516.html');
  });
});

describe('parseEpisodes — profile A (single .playlist, #sid stripped)', () => {
  const html = `<div class="playlist">
    <a href="/video/1564-2.html#sid=7">第02集</a>
    <a href="/video/1564-1.html#sid=7">第01集</a>
  </div>`;
  it('strips #sid, sorts asc', () => {
    const lines = parseEpisodes(html, PROFILE_A, 'https://gimytv.biz');
    expect(lines[0].episodes.map((e) => e.ep)).toEqual([1, 2]);
    expect(lines[0].episodes[0].url).toBe('https://gimytv.biz/video/1564-1.html');
  });
});

describe('parseEpisodes — profile B (multi-line, external sorted last)', () => {
  const html = `
  <div class="playlist-block"><h3 class="playlist-block__title">騰訊線路</h3>
    <div class="playlist-grid"><a href="/ep/245516-5-1.html">第01集</a></div></div>
  <div class="playlist-block"><h3 class="playlist-block__title">速播雲</h3>
    <div class="playlist-grid"><a href="/ep/245516-9-1.html">第01集</a><a href="/ep/245516-9-2.html">第02集</a></div></div>`;
  it('keeps sid in path, puts m3u8 line first (qq/騰訊 last)', () => {
    const lines = parseEpisodes(html, PROFILE_B, 'https://gimyplus.com');
    expect(lines).toHaveLength(2);
    expect(lines[0].label).toBe('速播雲'); // 非外部源排前
    expect(lines[1].label).toBe('騰訊線路');
    expect(lines[0].episodes[0].url).toBe('https://gimyplus.com/ep/245516-9-1.html');
  });
});

describe('isDirectPlayable (line-pick by resolvability, not label)', () => {
  it('accepts real http m3u8/mp4', () => {
    expect(isDirectPlayable('https://play.xluuss.com/a/index.m3u8')).toBe(true);
    expect(isDirectPlayable('https://x/a.mp4')).toBe(true);
  });
  it('rejects gimyplus parser-only tokens + empties', () => {
    expect(isDirectPlayable('JD-e7ef69b1fb252354')).toBe(false); // 4K畫質線路 token
    expect(isDirectPlayable('NSYS-2ff4e382')).toBe(false);
    expect(isDirectPlayable('')).toBe(false);
    expect(isDirectPlayable(null)).toBe(false);
  });
});

describe('EXTERNAL_SOURCE', () => {
  it('flags external (unplayable) source labels', () => {
    expect(EXTERNAL_SOURCE.test('騰訊線路')).toBe(true);
    expect(EXTERNAL_SOURCE.test('愛奇藝')).toBe(true);
    expect(EXTERNAL_SOURCE.test('速播雲')).toBe(false);
  });
});

describe('extractPlayerConfig + decodePlayUrl (shared)', () => {
  it('brace-matches nested player_aaaa (profile A) and unescapes url', () => {
    const html = `<script>var player_aaaa={"encrypt":0,"vod_data":{"vod_name":"x"},"url":"https:\\/\\/play.modujx10.com\\/a\\/index.m3u8","from":"modum3u8"};</script>`;
    const cfg = extractPlayerConfig(html);
    expect(cfg.url).toBe('https://play.modujx10.com/a/index.m3u8');
    expect(cfg.encrypt).toBe(0);
  });
  it('also reads player_data (profile B / gimyplus)', () => {
    const html = `<script>var player_data={"flag":"play","encrypt":0,"link_next":"\\/ep\\/1-2-1.html","vod_data":{"vod_name":"x"},"url":"https:\\/\\/play.xluuss.com\\/a\\/index.m3u8","from":"xlm3u8"};</script>`;
    const cfg = extractPlayerConfig(html);
    expect(cfg.url).toBe('https://play.xluuss.com/a/index.m3u8');
    expect(cfg.from).toBe('xlm3u8');
  });
  it('decodes encrypt 0/1', () => {
    expect(decodePlayUrl('https://x/a.m3u8', 0)).toBe('https://x/a.m3u8');
    expect(decodePlayUrl('https%3A%2F%2Fx%2Fa.m3u8', 1)).toBe('https://x/a.m3u8');
  });
});

describe('registry routing — 4 gimy mirrors + 2 profiles', () => {
  it('matchGimyProvider maps each domain to its provider id', () => {
    expect(matchGimyProvider('https://gimyplus.com')?.id).toBe('gimyplus');
    expect(matchGimyProvider('https://gimytv.biz')?.id).toBe('gimytv');
    expect(matchGimyProvider('https://gimytw.net')?.id).toBe('gimytw');
    expect(matchGimyProvider('https://anime1.in')).toBeNull();
  });
  it('getProvider routes a gimy Anime by site; anime1 untouched', () => {
    const a: Anime = { site: 'https://gimyplus.com', slug: '1', name: 'x', num: null, cntText: '', latestUrl: '', update: '', updateYear: '其他', search: 'x' };
    expect(getProvider(a).id).toBe('gimyplus');
    expect(getProviderBySite('https://anime1.me').id).toBe('anime1me');
    expect(getProviderBySite('https://anime1.in').id).toBe('anime1');
  });
  it('registers the active gimy providers (gimyplus B, gimytv/gimytw A)', () => {
    expect(gimyProviders.map((g) => g.cfg.id).sort()).toEqual(['gimyplus', 'gimytv', 'gimytw']);
    expect(gimyProviders.every((g) => typeof g.provider.resolveStream === 'function')).toBe(true);
  });
});
