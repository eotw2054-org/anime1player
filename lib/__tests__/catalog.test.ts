import { buildSections, buildEpBuckets, groupAnimes, normalizeName } from '../catalog';
import { type Anime } from '../anime1';
import { type Chapter } from '../types';

const SITE = 'https://anime1.in';
const anime = (slug: string, year: string, name = slug, site = SITE): Anime => ({
  site,
  slug,
  name,
  num: 1,
  cntText: '',
  latestUrl: `${site}/${slug}`,
  update: `${year}-01-01`,
  updateYear: year,
  search: (name + ' ' + slug).toLowerCase(),
});

describe('buildSections (all tab)', () => {
  const lists = { in: [anime('a', '2026'), anime('b', '2025')] };
  const enabled = { in: true, one: false, cc: false };

  it('groups by year, newest first', () => {
    const out = buildSections(lists, enabled, [], '', 'all');
    expect(out.map((s) => s.title)).toEqual(['2026 年更新', '2025 年更新']);
  });

  it('puts 其他 last', () => {
    const out = buildSections({ in: [anime('a', '2026'), anime('z', '其他')] }, enabled, [], '', 'all');
    expect(out[out.length - 1].title).toBe('其他');
  });

  it('only includes enabled sites', () => {
    const two = { in: [anime('a', '2026')], one: [anime('b', '2026')] };
    const out = buildSections(two, { in: true, one: false, cc: false }, [], '', 'all');
    expect(out.flatMap((s) => s.data.map((g) => g.primary.slug))).toEqual(['a']);
  });

  it('dedups by site|slug across sites (keeps first)', () => {
    const dup = { in: [anime('a', '2026', 'first')], one: [anime('a', '2026', 'second')] };
    const out = buildSections(dup, { in: true, one: true, cc: false }, [], '', 'all');
    const all = out.flatMap((s) => s.data);
    expect(all).toHaveLength(1);
    expect(all[0].primary.name).toBe('first');
  });

  it('filters by query against search and slug', () => {
    const out = buildSections(lists, enabled, [], 'b', 'all');
    expect(out.flatMap((s) => s.data.map((g) => g.primary.slug))).toEqual(['b']);
  });

  it('groups same-name across sources into one row (primary = has real year)', () => {
    // 天命: anime1.cc(有年份) + gimytv/gimytw(其他);天命動漫 應併入天命
    const lists2 = {
      cc: [anime('tm', '2026', '天命', 'https://anime1.cc')],
      gimytv: [anime('999', '其他', '天命動漫', 'https://gimytv.biz')],
      gimytw: [anime('888', '其他', '天命', 'https://gimytw.net')],
    };
    const en = { cc: true, gimytv: true, gimytw: true } as any;
    const out = buildSections(lists2, en, [], '', 'all');
    // 應該歸入 2026 組(primary 有年份),一個 group,三個來源
    const yr = out.find((s) => s.title === '2026 年更新')!;
    expect(yr.data).toHaveLength(1);
    expect(yr.data[0].primary.name).toBe('天命');
    expect(yr.data[0].primary.site).toBe('https://anime1.cc');
    expect(yr.data[0].sources).toHaveLength(3);
  });
});

describe('normalizeName + groupAnimes', () => {
  it('strips 動漫/動畫/空白 suffix so 天命動漫 == 天命', () => {
    expect(normalizeName('天命動漫')).toBe('天命');
    expect(normalizeName('天命 動畫')).toBe('天命');
    expect(normalizeName('天命')).toBe('天命');
  });

  it('groups by normalized name, primary prefers real year', () => {
    const g = groupAnimes([
      anime('999', '其他', '天命動漫', 'https://gimytv.biz'),
      anime('tm', '2026', '天命', 'https://anime1.cc'),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].primary.site).toBe('https://anime1.cc');
    expect(g[0].sources).toHaveLength(2);
  });

  it('keeps genuinely different names apart', () => {
    const g = groupAnimes([anime('a', '2026', '天命'), anime('b', '2026', '吞噬星空')]);
    expect(g).toHaveLength(2);
  });

  it('dedupes one chip per source site (天命 + 天命動漫 same site → one)', () => {
    const g = groupAnimes([
      anime('tm', '2026', '天命', 'https://anime1.cc'),
      anime('tm2', '其他', '天命動漫', 'https://anime1.cc'), // 同站、唔同 slug
      anime('g1', '其他', '天命動漫', 'https://gimytv.biz'),
      anime('g2', '其他', '天命', 'https://gimytv.biz'),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].sources).toHaveLength(2); // cc 一個 + gimytv 一個
    expect(g[0].sources.map((a) => a.site).sort()).toEqual(['https://anime1.cc', 'https://gimytv.biz']);
    // 每站留短名嗰個
    expect(g[0].sources.find((a) => a.site.includes('cc'))!.name).toBe('天命');
    expect(g[0].sources.find((a) => a.site.includes('gimytv'))!.name).toBe('天命');
  });
});

describe('buildSections (fav tab)', () => {
  it('returns a single 最愛 section when non-empty', () => {
    const out = buildSections({}, {}, [anime('a', '2026')], '', 'fav');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('★ 我的最愛');
  });

  it('returns [] when no favorites match', () => {
    expect(buildSections({}, {}, [], '', 'fav')).toEqual([]);
  });
});

describe('buildEpBuckets', () => {
  const chapters = (n: number): Chapter[] =>
    Array.from({ length: n }, (_, i) => ({ ep: i + 1, url: `u${i + 1}` }));

  it('returns [] when count <= bucket size', () => {
    expect(buildEpBuckets(chapters(50), 50)).toEqual([]);
  });

  it('splits into labelled buckets when over the size', () => {
    const out = buildEpBuckets(chapters(120), 50);
    expect(out).toEqual([
      { start: 0, end: 50, label: '1–50' },
      { start: 50, end: 100, label: '51–100' },
      { start: 100, end: 120, label: '101–120' },
    ]);
  });
});
