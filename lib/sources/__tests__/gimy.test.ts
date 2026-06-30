import {
  parseCatalog,
  parseEpisodes,
  extractPlayerConfig,
  decodePlayUrl,
  catalogPageUrl,
  gimyProvider,
  SITE,
} from '../gimy';
import { getProvider, getProviderBySite } from '../registry';
import { type Anime } from '../../anime1';

describe('gimy catalogPageUrl', () => {
  it('page 1 has empty page slot; page>=2 numbers it', () => {
    expect(catalogPageUrl(1)).toBe('https://gimytv.biz/vodshow/4-----------.html');
    expect(catalogPageUrl(2)).toBe('https://gimytv.biz/vodshow/4--------2---.html');
  });
});

describe('gimy parseCatalog', () => {
  const html = `
  <ul><li class="col-md-2 col-sm-3 col-xs-4">
    <a class="video-pic loading" data-original="/upload/vod/x.jpg" href="/voddetail/1564.html" title="仙逆">
      <span class="player"></span><span class="note text-bg-r">更新更新至147集</span></a>
    <div class="title"><h5 class="text-overflow"><a href="/voddetail/1564.html" title="仙逆">仙逆</a></h5></div>
    <div class="subtitle">王林,李慕婉</div>
  </li>
  <li><a class="video-pic" href="/voddetail/27104.html" title="我們的仙境"><span class="note">更新更新至03集</span></a></li>
  </ul>`;
  it('parses li items into Anime with gimy site + cleaned note + episode count', () => {
    const list = parseCatalog(html);
    expect(list).toHaveLength(2);
    const a = list[0];
    expect(a.site).toBe(SITE);
    expect(a.slug).toBe('1564');
    expect(a.name).toBe('仙逆');
    expect(a.num).toBe(147);
    expect(a.cntText).toBe('更新至147集'); // 模板重複「更新」已清
    expect(a.latestUrl).toBe('https://gimytv.biz/voddetail/1564.html');
  });
});

describe('gimy parseEpisodes', () => {
  const html = `<div class="playlist layout-box">
    <a href="/video/1564-1.html#sid=7">第01集</a>
    <a href="/video/1564-3.html#sid=7">第03集</a>
    <a href="/video/1564-2.html#sid=7">第02集</a>
  </div>
  <div class="playlist">other line</div>`;
  it('takes first line, strips #sid, sorts by ep, absolutizes', () => {
    const eps = parseEpisodes(html);
    expect(eps.map((e) => e.ep)).toEqual([1, 2, 3]);
    expect(eps[0].url).toBe('https://gimytv.biz/video/1564-1.html');
    expect(eps[2].url).toBe('https://gimytv.biz/video/1564-3.html');
  });
});

describe('gimy extractPlayerConfig', () => {
  const html = `<script>var player_aaaa={"flag":"play","encrypt":0,"link_next":"\\/video\\/1564-2.html#sid=7","link_pre":"","vod_data":{"vod_name":"\\u4ed9\\u9006"},"url":"https:\\/\\/play.modujx10.com\\/a\\/index.m3u8","from":"modum3u8"};</script>`;
  it('brace-matches nested JSON and unescapes url', () => {
    const cfg = extractPlayerConfig(html);
    expect(cfg.encrypt).toBe(0);
    expect(cfg.url).toBe('https://play.modujx10.com/a/index.m3u8');
    expect(cfg.link_next).toBe('/video/1564-2.html#sid=7');
    expect(cfg.vod_data.vod_name).toBe('仙逆');
  });
  it('returns null when absent', () => {
    expect(extractPlayerConfig('<script>var x=1;</script>')).toBeNull();
  });
});

describe('gimy decodePlayUrl', () => {
  it('encrypt 0 returns url as-is', () => {
    expect(decodePlayUrl('https://x/a.m3u8', 0)).toBe('https://x/a.m3u8');
  });
  it('encrypt 1 url-decodes', () => {
    expect(decodePlayUrl('https%3A%2F%2Fx%2Fa.m3u8', 1)).toBe('https://x/a.m3u8');
  });
  it('encrypt 2 base64-decodes (when atob available)', () => {
    if (typeof atob === 'function') {
      expect(decodePlayUrl('aHR0cDovL3gvYS5tM3U4', 2)).toBe('http://x/a.m3u8');
    }
  });
});

describe('gimy registry routing', () => {
  const gimyAnime = (): Anime => ({
    site: SITE, slug: '1564', name: '仙逆', num: 147, cntText: '更新至147集',
    latestUrl: 'https://gimytv.biz/voddetail/1564.html', update: '', updateYear: '其他', search: '仙逆',
  });
  it('routes gimy site to gimyProvider', () => {
    expect(getProviderBySite('https://gimytv.biz').id).toBe('gimy');
    expect(getProvider(gimyAnime()).id).toBe('gimy');
  });
  it('does not steal anime1 / anime1.me routing', () => {
    expect(getProviderBySite('https://anime1.in').id).toBe('anime1');
    expect(getProviderBySite('https://anime1.me').id).toBe('anime1me');
  });
  it('exposes expected capabilities (no adDetector for gimy)', () => {
    expect(gimyProvider.id).toBe('gimy');
    expect(typeof gimyProvider.resolveStream).toBe('function');
    expect(gimyProvider.adDetector).toBeUndefined();
  });
});
