import { anime1Provider } from '../anime1';
import { getProvider, getProviderBySite } from '../registry';
import { buildChapters, type Anime } from '../../anime1';

const anime = (over: Partial<Anime> = {}): Anime => ({
  site: 'https://anime1.in',
  slug: 'foo',
  name: 'Foo',
  num: 3,
  cntText: '連載中(03)',
  latestUrl: 'https://anime1.in/foo',
  update: '2026-01-01',
  updateYear: '2026',
  search: 'foo',
  ...over,
});

describe('anime1Provider.getEpisodes', () => {
  it('a.num fast path returns a single 預設 line built from buildChapters', async () => {
    const lines = await anime1Provider.getEpisodes(anime({ num: 3 }));
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe('預設');
    expect(lines[0].episodes).toEqual(buildChapters('https://anime1.in', 'foo', 3));
    expect(lines[0].episodes).toHaveLength(3);
  });

  it('exposes the expected provider identity + capabilities', () => {
    expect(anime1Provider.id).toBe('anime1');
    expect(typeof anime1Provider.getEpisode).toBe('function');
    expect(typeof anime1Provider.resolveStream).toBe('function');
    expect(typeof anime1Provider.adDetector).toBe('function'); // anime1 實作廣告偵測
  });
});

describe('registry', () => {
  it('resolves anime1Provider by Anime and by site', () => {
    expect(getProvider(anime()).id).toBe('anime1');
    expect(getProviderBySite('https://anime1.one').id).toBe('anime1');
  });

  it('falls back to anime1Provider for unknown sites', () => {
    expect(getProviderBySite('https://unknown.example').id).toBe('anime1');
  });
});
