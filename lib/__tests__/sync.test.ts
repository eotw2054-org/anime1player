import { mergeFavorites, mergeByRecency } from '../sync';

const keyOf = (a: { site: string; slug: string }) => a.site + '|' + a.slug;
const fav = (slug: string, at: number, extra: object = {}) => ({ site: 's', slug, at, ...extra });

describe('mergeFavorites', () => {
  it('unions disjoint local and remote entries', () => {
    const out = mergeFavorites([fav('a', 1)], [fav('b', 1)], keyOf);
    expect(out.map((e) => e.slug).sort()).toEqual(['a', 'b']);
  });

  it('keeps the entry with the larger `at` (last-write-wins)', () => {
    const out = mergeFavorites([fav('a', 5, { name: 'new' })], [fav('a', 1, { name: 'old' })], keyOf);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('new');
  });

  it('prefers local on an `at` tie', () => {
    const out = mergeFavorites([fav('a', 3, { name: 'local' })], [fav('a', 3, { name: 'remote' })], keyOf);
    expect(out[0].name).toBe('local');
  });

  it('retains a recent tombstone so the deletion keeps propagating', () => {
    const out = mergeFavorites([fav('a', Date.now(), { deleted: true })], [fav('a', 1)], keyOf);
    expect(out).toHaveLength(1);
    expect(out[0].deleted).toBe(true);
  });

  it('garbage-collects a tombstone older than 30 days', () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const out = mergeFavorites([fav('a', old, { deleted: true })], [], keyOf);
    expect(out).toHaveLength(0);
  });

  it('handles empty inputs', () => {
    expect(mergeFavorites([], [], keyOf)).toEqual([]);
    expect(mergeFavorites(undefined as any, undefined as any, keyOf)).toEqual([]);
  });
});

describe('mergeByRecency', () => {
  it('unions disjoint keys', () => {
    const out = mergeByRecency({ a: { at: 1 } }, { b: { at: 1 } });
    expect(Object.keys(out).sort()).toEqual(['a', 'b']);
  });

  it('local overwrites remote when newer', () => {
    const out = mergeByRecency({ a: { at: 5, v: 'L' } }, { a: { at: 1, v: 'R' } });
    expect(out.a.v).toBe('L');
  });

  it('remote kept when newer than local', () => {
    const out = mergeByRecency({ a: { at: 1, v: 'L' } }, { a: { at: 5, v: 'R' } });
    expect(out.a.v).toBe('R');
  });

  it('local wins on a tie', () => {
    const out = mergeByRecency({ a: { at: 3, v: 'L' } }, { a: { at: 3, v: 'R' } });
    expect(out.a.v).toBe('L');
  });

  it('handles empty inputs', () => {
    expect(mergeByRecency({}, {})).toEqual({});
  });
});
