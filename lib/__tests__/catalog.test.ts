import { buildSections, buildEpBuckets } from '../catalog';
import { type Anime } from '../anime1';
import { type Chapter } from '../types';

const SITE = 'https://anime1.in';
const anime = (slug: string, year: string, name = slug): Anime => ({
  site: SITE,
  slug,
  name,
  num: 1,
  cntText: '',
  latestUrl: `${SITE}/${slug}`,
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
    expect(out.flatMap((s) => s.data.map((a) => a.slug))).toEqual(['a']);
  });

  it('dedups by site|slug across sites (keeps first)', () => {
    const dup = { in: [anime('a', '2026', 'first')], one: [anime('a', '2026', 'second')] };
    const out = buildSections(dup, { in: true, one: true, cc: false }, [], '', 'all');
    const all = out.flatMap((s) => s.data);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('first');
  });

  it('filters by query against search and slug', () => {
    const out = buildSections(lists, enabled, [], 'b', 'all');
    expect(out.flatMap((s) => s.data.map((a) => a.slug))).toEqual(['b']);
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
