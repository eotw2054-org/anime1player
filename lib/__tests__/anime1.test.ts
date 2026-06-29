import { buildChapters, isPlayable, parseHomeList } from '../anime1';

describe('buildChapters', () => {
  it('builds sequential episode URLs with the 10NNN000 code scheme', () => {
    const out = buildChapters('https://anime1.in', 'foo', 3);
    expect(out).toEqual([
      { ep: 1, url: 'https://anime1.in/foo-10001000' },
      { ep: 2, url: 'https://anime1.in/foo-10002000' },
      { ep: 3, url: 'https://anime1.in/foo-10003000' },
    ]);
  });

  it('returns an empty list for a zero count', () => {
    expect(buildChapters('https://anime1.in', 'foo', 0)).toEqual([]);
  });
});

describe('isPlayable', () => {
  it.each([
    ['http://x/v.mp4', true],
    ['http://x/v.mp4?token=1', true],
    ['http://x/v.webm', true],
    ['http://x/index.m3u8', true],
    ['http://x/index.m3u8?a=b', true],
    ['http://x/page.html', false],
    ['http://x/v.mp4extra', false], // .mp4 not followed by ? or end
  ])('isPlayable(%s) === %s', (url, expected) => {
    expect(isPlayable(url)).toBe(expected);
  });

  it('returns false for null/empty', () => {
    expect(isPlayable(null)).toBe(false);
    expect(isPlayable('')).toBe(false);
  });
});

describe('parseHomeList', () => {
  const site = 'https://anime1.in';
  const row = (slug: string, name: string, cnt = '連載中(05)') => `
    <tr>
      <td class="column-1"><a href="/${slug}/">${name}</a></td>
      <td class="column-2" onclick="location.href='/${slug}-10005000'">${cnt}</td>
      <td class="column-3">動作</td>
      <td class="column-4">字幕組</td>
      <td class="column-5">2026-06-20</td>
      <td class="column-6">${name} pinyin</td>
    </tr>`;
  const table = (rows: string) => `<table id="tablepress-1"><tbody>${rows}</tbody></table>`;

  it('parses a row into a fully-populated Anime', () => {
    const out = parseHomeList(table(row('my-anime', 'My Anime')), site);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      site,
      slug: 'my-anime',
      name: 'My Anime',
      num: 5,
      cntText: '連載中(05)',
      latestUrl: 'https://anime1.in/my-anime-10005000',
      update: '2026-06-20',
      updateYear: '2026',
      search: 'my anime my anime pinyin',
    });
  });

  it('deduplicates rows that share a slug (keeps first)', () => {
    const out = parseHomeList(table(row('dup', 'First') + row('dup', 'Second')), site);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('First');
  });

  it('skips malformed rows without a title link', () => {
    const bad = '<tr><td class="column-2">x</td></tr>';
    const out = parseHomeList(table(bad + row('ok', 'OK')), site);
    expect(out.map((a) => a.slug)).toEqual(['ok']);
  });

  it('sets num to null when the count has no digits', () => {
    const out = parseHomeList(table(row('movie', 'Movie', '劇場版')), site);
    expect(out[0].num).toBeNull();
  });

  it('returns [] for html with no matching table', () => {
    expect(parseHomeList('<div>nothing</div>', site)).toEqual([]);
  });
});
