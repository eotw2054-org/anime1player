import { isStale, livePosition, progressPct, STALE_MS } from '../remoteProgress';

const NOW = 1_000_000;

describe('isStale', () => {
  it('false for null', () => {
    expect(isStale(null, NOW)).toBe(false);
  });
  it('false within the stale window', () => {
    expect(isStale({ _recvAt: NOW - 1000 }, NOW)).toBe(false);
  });
  it('true once older than STALE_MS', () => {
    expect(isStale({ _recvAt: NOW - STALE_MS - 1 }, NOW)).toBe(true);
  });
});

describe('livePosition', () => {
  it('extrapolates while playing from receive time', () => {
    expect(livePosition({ position: 10, playing: true, _recvAt: NOW - 2000 }, NOW)).toBe(12);
  });
  it('holds position when paused', () => {
    expect(livePosition({ position: 10, playing: false, _recvAt: NOW - 2000 }, NOW)).toBe(10);
  });
  it('returns 0 when stale', () => {
    expect(livePosition({ position: 10, playing: true, _recvAt: NOW - STALE_MS - 1 }, NOW)).toBe(0);
  });
  it('returns 0 for null', () => {
    expect(livePosition(null, NOW)).toBe(0);
  });
});

describe('progressPct', () => {
  it('clamps to 0..1', () => {
    expect(progressPct(50, 100)).toBe(0.5);
    expect(progressPct(150, 100)).toBe(1);
    expect(progressPct(-5, 100)).toBe(0);
  });
  it('returns 0 when duration is 0/unknown', () => {
    expect(progressPct(10, 0)).toBe(0);
  });
});
