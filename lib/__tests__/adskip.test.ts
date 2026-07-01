import { adSkipTarget, detectAdRanges, type AdRange } from '../adskip';
import { GIMY_MODU_ADS, GIMY_NOADS, MODU_ADS_URL, NOADS_URL } from './fixtures/gimyPlaylists';

describe('adSkipTarget', () => {
  const ranges: AdRange[] = [{ start: 10, end: 20, reason: 'x' }];

  it('returns the range end when currentTime is inside', () => {
    expect(adSkipTarget(15, ranges)).toBe(20);
  });

  it('returns null before the range', () => {
    expect(adSkipTarget(5, ranges)).toBeNull();
  });

  it('returns null after the range', () => {
    expect(adSkipTarget(25, ranges)).toBeNull();
  });

  it('triggers slightly early within the pad window', () => {
    // start - pad = 9.7, so 9.8 is already "inside"
    expect(adSkipTarget(9.8, ranges)).toBe(20);
  });

  it('stops triggering at end - pad', () => {
    // end - pad = 19.7; 19.7 is not < 19.7
    expect(adSkipTarget(19.7, ranges)).toBeNull();
  });

  it('returns null with no ranges', () => {
    expect(adSkipTarget(15, [])).toBeNull();
  });
});

describe('detectAdRanges', () => {
  const mediaUrl = 'https://cdn.example.com/20260623/contentID/1080/hls/index.m3u8';
  const seg = (path: string, dur = 4) => `#EXTINF:${dur.toFixed(1)},\n${path}`;

  it('flags a contiguous run of non-content segments as one ad range', () => {
    const media = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      seg('/20260623/contentID/1080/hls/s0.ts', 4),
      seg('/20260623/contentID/1080/hls/s1.ts', 4),
      '#EXT-X-DISCONTINUITY',
      seg('/20260623/adID/1080/hls/a0.ts', 5),
      seg('/20260623/adID/1080/hls/a1.ts', 5),
      '#EXT-X-DISCONTINUITY',
      seg('/20260623/contentID/1080/hls/s2.ts', 4),
      '#EXT-X-ENDLIST',
    ].join('\n');

    const ranges = detectAdRanges(media, mediaUrl);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(8); // after two 4s content segments
    expect(ranges[0].end).toBe(18); // 8 + 5 + 5
  });

  it('returns no ranges when every segment is content', () => {
    const media = [
      '#EXTM3U',
      seg('/20260623/contentID/1080/hls/s0.ts', 4),
      seg('/20260623/contentID/1080/hls/s1.ts', 4),
      '#EXT-X-ENDLIST',
    ].join('\n');
    expect(detectAdRanges(media, mediaUrl)).toEqual([]);
  });

  it('returns [] for an empty / segment-less playlist', () => {
    expect(detectAdRanges('#EXTM3U\n#EXT-X-ENDLIST', mediaUrl)).toEqual([]);
  });
});

// 真實 gimy playlist fixture（2026-07-01 抽自 gimyplus 仙逆）—— 鎖住 maccms 廣告偵測行為。
describe('detectAdRanges — gimy real playlists', () => {
  it('偵測到 modu(清晰雲)嘅 stitched 廣告', () => {
    const ranges = detectAdRanges(GIMY_MODU_ADS, MODU_ADS_URL);
    expect(ranges.length).toBeGreaterThanOrEqual(4);
    const adSecs = ranges.reduce((a, r) => a + (r.end - r.start), 0);
    expect(adSecs).toBeGreaterThan(30);
    // 廣告段來自外來 path-id，唔會係正片 id 6aJSbktn
    for (const r of ranges) expect(r.reason).not.toContain('6aJSbktn');
  });

  it('無 stitched 廣告嘅 playlist(xluuss 速播雲)回 []', () => {
    expect(detectAdRanges(GIMY_NOADS, NOADS_URL)).toEqual([]);
  });

  it('已知正片時間點(100s)唔喺任何廣告區間內', () => {
    const ranges = detectAdRanges(GIMY_MODU_ADS, MODU_ADS_URL);
    expect(ranges.some((r) => 100 >= r.start && 100 < r.end)).toBe(false);
  });
});
