import { adSkipTarget, detectAdRanges, type AdRange } from '../adskip';

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
