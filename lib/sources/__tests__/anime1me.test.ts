import {
  mapCatalog,
  parseEpisodeList,
  parseApireq,
  parseAdjacent,
  parseApiSource,
  parseSetCookiePairs,
  episodeNoFromTitle,
  anime1meProvider,
  SITE,
} from '../anime1me';
import { getProvider, getProviderBySite } from '../registry';
import { type Anime } from '../../anime1';

// 真實 animelist.json row 形狀:[catId, nameHtml, 集數, 年, 季, 字幕組]
const ROWS = [
  [0, '<a href="https://anime1.pw/?cat=60">這樣高大的女孩子你喜歡嗎？</a>', '1-12', '2026', '春', '桜都'],
  [1907, 'THE WORLD IS DANCING 世界在起舞', '連載中(01)', '2026', '夏', ''],
  [1866, 'MAO摩緒', '連載中(13)', '2026', '春', ''],
  ['0', '<a href="https://anime1.pw/?cat=61">另一隻成人番</a>', '1-6', '2025', '冬', ''],
];

describe('mapCatalog', () => {
  it('drops 18+ rows (catId===0, number or string) and keeps the rest', () => {
    const list = mapCatalog(ROWS);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.name.includes('這樣高大'))).toBeUndefined();
    expect(list.some((a) => a.search.includes('anime1.pw'))).toBe(false);
  });

  it('maps a normal row into an anime1.me Anime', () => {
    const a = mapCatalog(ROWS).find((x) => x.slug === '1866')!;
    expect(a.site).toBe(SITE);
    expect(a.name).toBe('MAO摩緒');
    expect(a.latestUrl).toBe('https://anime1.me/?cat=1866');
    expect(a.updateYear).toBe('2026');
  });

  it('handles non-array / empty input', () => {
    expect(mapCatalog(null as any)).toEqual([]);
    expect(mapCatalog([])).toEqual([]);
  });
});

describe('episodeNoFromTitle', () => {
  it('extracts [NN]', () => {
    expect(episodeNoFromTitle('MAO摩緒 [13]')).toBe('13');
    expect(episodeNoFromTitle('某劇場版')).toBe('?');
  });
});

describe('parseEpisodeList', () => {
  // 分類頁新→舊;期望輸出舊→新、重新編號
  const html = `
    <h2 class="entry-title"><a href="https://anime1.me/29333" rel="bookmark">MAO摩緒 [13]</a></h2>
    <h2 class="entry-title"><a href="https://anime1.me/29285" rel="bookmark">MAO摩緒 [12]</a></h2>
    <h2 class="entry-title"><a href="https://anime1.me/29219" rel="bookmark">MAO摩緒 [11]</a></h2>`;
  it('orders oldest→newest by episode number', () => {
    const eps = parseEpisodeList(html);
    expect(eps).toHaveLength(3);
    expect(eps[0].url).toBe('https://anime1.me/29219'); // ep11 first
    expect(eps[2].url).toBe('https://anime1.me/29333'); // ep13 last
    expect(eps.map((e) => e.ep)).toEqual([1, 2, 3]);
  });
});

describe('parseApireq', () => {
  it('extracts the data-apireq token', () => {
    const html = '<video controls data-apireq="%7B%22c%22%3A%221866%22%7D"></video>';
    expect(parseApireq(html)).toBe('%7B%22c%22%3A%221866%22%7D');
  });
  it('returns null when absent', () => {
    expect(parseApireq('<video></video>')).toBeNull();
  });
});

describe('parseAdjacent', () => {
  it('reads 上一集 / 下一集 as absolute /?p= urls, ignoring empty', () => {
    const html = `
      <a href="/?p=29219">上一集</a>
      <a href="/?p=29333">下一集</a>`;
    expect(parseAdjacent(html)).toEqual({
      prevUrl: 'https://anime1.me/?p=29219',
      nextUrl: 'https://anime1.me/?p=29333',
    });
  });
  it('treats empty /?p= (newest/oldest) as null', () => {
    const html = '<a href="/?p=">下一集</a>';
    expect(parseAdjacent(html).nextUrl).toBeNull();
  });
});

describe('parseApiSource', () => {
  it('resolves protocol-relative src to https', () => {
    const json = { s: [{ src: '//hinata.v.anime1.me/1866/13b.mp4', type: 'video/mp4' }] };
    expect(parseApiSource(json)).toBe('https://hinata.v.anime1.me/1866/13b.mp4');
  });
  it('returns null on error shape', () => {
    expect(parseApiSource({ success: false })).toBeNull();
    expect(parseApiSource(null)).toBeNull();
  });
});

describe('parseSetCookiePairs', () => {
  // 主路:expo/fetch _rawHeaders = [name,value][],重複 set-cookie 各自一條
  it('reads e/p/h from _rawHeaders (duplicates preserved), JWT-with-dots intact', () => {
    const resp = {
      _rawHeaders: [
        ['content-type', 'application/json'],
        ['set-cookie', 'e=1782826381; expires=Tue, 30 Jun 2026 13:33:01 GMT; Max-Age=28799; path=/1901/1.mp4; domain=.v.anime1.me; secure; HttpOnly'],
        ['Set-Cookie', 'p=eyJpc3MiOiJhbmltZTEubWU.abc-_def; Max-Age=28799; path=/1901/1.mp4; domain=.v.anime1.me; secure; HttpOnly'],
        ['set-cookie', 'h=ui04ZJ9kPgO259WE3D1kww; Max-Age=28799; path=/1901/1.mp4; domain=.v.anime1.me; secure; HttpOnly'],
      ],
    };
    expect(parseSetCookiePairs(resp)).toBe('e=1782826381; p=eyJpc3MiOiJhbmltZTEubWU.abc-_def; h=ui04ZJ9kPgO259WE3D1kww');
  });

  // 後備:whatwg-fetch Headers.get 會用 ", " 合併（本站用 Max-Age 冇逗號,可安全切）
  it('falls back to comma-joined headers.get when _rawHeaders absent', () => {
    const merged =
      'e=1782826381; Max-Age=28799; path=/1901/1.mp4, p=eyJ.abc.def; Max-Age=28799; path=/1901/1.mp4, h=xyz123; Max-Age=28799; path=/1901/1.mp4';
    const resp = { headers: { get: (k: string) => (k.toLowerCase() === 'set-cookie' ? merged : null) } };
    expect(parseSetCookiePairs(resp)).toBe('e=1782826381; p=eyJ.abc.def; h=xyz123');
  });

  it('returns empty string when no e/p/h cookies present', () => {
    expect(parseSetCookiePairs({ _rawHeaders: [['x-foo', 'bar']] })).toBe('');
    expect(parseSetCookiePairs({})).toBe('');
  });
});

describe('registry routing', () => {
  const meAnime = (over: Partial<Anime> = {}): Anime => ({
    site: SITE, slug: '1866', name: 'MAO摩緒', num: null, cntText: '連載中(13)',
    latestUrl: 'https://anime1.me/?cat=1866', update: '2026 春', updateYear: '2026', search: 'mao', ...over,
  });
  it('routes anime1.me to anime1me provider', () => {
    expect(getProviderBySite('https://anime1.me').id).toBe('anime1me');
    expect(getProvider(meAnime()).id).toBe('anime1me');
  });
  it('routes mirrors to the original anime1 provider', () => {
    expect(getProviderBySite('https://anime1.in').id).toBe('anime1');
    expect(getProvider(meAnime({ site: 'https://anime1.in', slug: 'mao' })).id).toBe('anime1');
  });
  it('exposes expected provider identity + capabilities', () => {
    expect(anime1meProvider.id).toBe('anime1me');
    expect(typeof anime1meProvider.loadCatalog).toBe('function');
    expect(typeof anime1meProvider.getEpisodes).toBe('function');
    expect(typeof anime1meProvider.resolveStream).toBe('function');
    expect(typeof anime1meProvider.adDetector).toBe('function');
  });
});
