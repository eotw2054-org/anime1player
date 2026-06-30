import { setMark, clearMark } from '../marks';
import { type Marks } from '../types';

const NOW = 1_000_000;

describe('setMark', () => {
  it('sets a start marker (floored, clamped to >=0) with timestamp', () => {
    const out = setMark({}, 'a', 'start', 12.9, NOW);
    expect(out).toEqual({ a: { start: 12, at: NOW } });
  });

  it('sets end without dropping an existing start', () => {
    const base: Marks = { a: { start: 5, at: 1 } };
    const out = setMark(base, 'a', 'end', 100.4, NOW);
    expect(out.a).toEqual({ start: 5, end: 100, at: NOW });
  });

  it('clamps negative time to 0', () => {
    expect(setMark({}, 'a', 'start', -3, NOW).a.start).toBe(0);
  });

  it('does not mutate the input', () => {
    const base: Marks = { a: { start: 5 } };
    setMark(base, 'a', 'end', 10, NOW);
    expect(base).toEqual({ a: { start: 5 } });
  });

  it('keys are independent', () => {
    const out = setMark({ a: { start: 1, at: 1 } }, 'b', 'start', 2, NOW);
    expect(out.a).toEqual({ start: 1, at: 1 });
    expect(out.b).toEqual({ start: 2, at: NOW });
  });
});

describe('clearMark', () => {
  it('removes one field, keeps the other, refreshes at', () => {
    const base: Marks = { a: { start: 5, end: 100, at: 1 } };
    const out = clearMark(base, 'a', 'start', NOW);
    expect(out.a).toEqual({ end: 100, at: NOW });
  });

  it('clearing the only field leaves just the timestamp', () => {
    const out = clearMark({ a: { end: 50, at: 1 } }, 'a', 'end', NOW);
    expect(out.a).toEqual({ at: NOW });
  });

  it('does not mutate the input', () => {
    const base: Marks = { a: { start: 5, end: 100 } };
    clearMark(base, 'a', 'start', NOW);
    expect(base).toEqual({ a: { start: 5, end: 100 } });
  });
});
