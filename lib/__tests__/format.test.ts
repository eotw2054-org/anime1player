import { favKey, fmtTime } from '../format';

describe('favKey', () => {
  it('joins site and slug with a pipe', () => {
    expect(favKey({ site: 'https://anime1.in', slug: 'foo' })).toBe('https://anime1.in|foo');
  });
});

describe('fmtTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3661, '61:01'],
  ])('fmtTime(%i) === %s', (sec, expected) => {
    expect(fmtTime(sec)).toBe(expected);
  });

  it('clamps invalid/negative input to 0:00', () => {
    expect(fmtTime(-5)).toBe('0:00');
    expect(fmtTime(NaN)).toBe('0:00');
    expect(fmtTime(Infinity)).toBe('0:00');
  });
});
