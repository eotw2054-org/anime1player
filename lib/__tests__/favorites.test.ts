import { favMapFromArray, activeFavorites, toggleFavEntry } from '../favorites';
import { type Anime } from '../anime1';

const SITE = 'https://anime1.in';
const anime = (slug: string): Anime => ({
  site: SITE,
  slug,
  name: slug,
  num: 1,
  cntText: '',
  latestUrl: `${SITE}/${slug}`,
  update: '2026-01-01',
  updateYear: '2026',
  search: slug,
});
const NOW = 1_000_000;

describe('favMapFromArray', () => {
  it('keys entries by site|slug and skips falsy', () => {
    const map = favMapFromArray([anime('a'), null, anime('b')]);
    expect(Object.keys(map).sort()).toEqual([`${SITE}|a`, `${SITE}|b`]);
  });
});

describe('activeFavorites', () => {
  it('filters out tombstones', () => {
    const map = favMapFromArray([anime('a'), { site: SITE, slug: 'b', deleted: true, at: 1 }]);
    expect(activeFavorites(map).map((a) => a.slug)).toEqual(['a']);
  });
});

describe('toggleFavEntry', () => {
  it('adds a full entry with timestamp when not favorited', () => {
    const out = toggleFavEntry({}, anime('a'), NOW);
    expect(out[`${SITE}|a`]).toMatchObject({ slug: 'a', name: 'a', at: NOW });
    expect(out[`${SITE}|a`].deleted).toBeUndefined();
  });

  it('writes a tombstone when currently active (not just removed)', () => {
    const map = favMapFromArray([anime('a')]);
    const out = toggleFavEntry(map, anime('a'), NOW);
    expect(out[`${SITE}|a`]).toEqual({ site: SITE, slug: 'a', deleted: true, at: NOW });
  });

  it('re-adds a previously deleted favorite', () => {
    const map = { [`${SITE}|a`]: { site: SITE, slug: 'a', deleted: true, at: 1 } };
    const out = toggleFavEntry(map, anime('a'), NOW);
    expect(out[`${SITE}|a`].deleted).toBeUndefined();
    expect(out[`${SITE}|a`].at).toBe(NOW);
  });

  it('does not mutate the input map', () => {
    const map = favMapFromArray([anime('a')]);
    const snapshot = JSON.stringify(map);
    toggleFavEntry(map, anime('a'), NOW);
    expect(JSON.stringify(map)).toBe(snapshot);
  });
});
