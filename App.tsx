import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer, type VideoSource } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type Anime,
  SITES,
  fetchHtml,
  parseHomeList,
  buildChapters,
  parseEpisode,
  resolveSource,
  isPlayable,
} from './lib/anime1';

// ===== 霓虹放映室 配色 =====
const C = {
  ground: '#13121A',
  panel: '#1C1A28',
  line: '#2A2738',
  text: '#F3EEF8',
  dim: '#9A93AD',
  rose: '#FF4D8D',
  cyan: '#3FE0FF',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type SiteKey = keyof typeof SITES;
type Tab = 'all' | 'fav';
interface Chapter {
  ep: number;
  url: string;
}
interface Current {
  anime: Anime;
  episodeUrl: string;
  episodeNo: string;
  streams: { label: string; embedUrl: string }[];
  streamIndex: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

const favKey = (a: { site: string; slug: string }) => a.site + '|' + a.slug;

export default function App() {
  const [siteKey, setSiteKey] = useState<SiteKey>('in');
  const [list, setList] = useState<Anime[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const [favorites, setFavorites] = useState<Anime[]>([]);
  const favSet = useMemo(() => new Set(favorites.map(favKey)), [favorites]);

  const [selected, setSelected] = useState<Anime | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [current, setCurrent] = useState<Current | null>(null);
  const [resolving, setResolving] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  // 側欄收合 + 焦點（D-pad / 空中滑鼠）+ 集數分段 + 全螢幕
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [epRange, setEpRange] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsOnPlay, setFsOnPlay] = useState(false);
  const [ctrlShown, setCtrlShown] = useState(true);
  const [srcOpen, setSrcOpen] = useState(false);

  const [skip, setSkip] = useState('0');
  const skipRef = useRef(0);
  useEffect(() => {
    skipRef.current = parseFloat(skip) || 0;
  }, [skip]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      if (skipRef.current > 0) {
        try {
          player.currentTime = skipRef.current;
        } catch {}
      }
      player.play();
    }
  });

  // 播完自動跳下一集
  const currentRef = useRef<Current | null>(null);
  useEffect(() => {
    currentRef.current = current;
  });
  useEventListener(player, 'playToEnd', () => {
    const c = currentRef.current;
    if (c?.nextUrl) playEpisode(c.nextUrl);
  });

  // 載入設定 + 我的最愛
  useEffect(() => {
    (async () => {
      const [s, sk, fav, fop] = await Promise.all([
        AsyncStorage.getItem('site'),
        AsyncStorage.getItem('skip'),
        AsyncStorage.getItem('favorites'),
        AsyncStorage.getItem('fsOnPlay'),
      ]);
      if (s === 'in' || s === 'one') setSiteKey(s);
      if (sk) setSkip(sk);
      if (fop === '1') setFsOnPlay(true);
      if (fav) {
        try {
          setFavorites(JSON.parse(fav));
        } catch {}
      }
    })();
  }, []);

  useEffect(() => {
    loadList(siteKey);
    AsyncStorage.setItem('site', siteKey);
  }, [siteKey]);

  async function loadList(site: SiteKey) {
    setLoadingList(true);
    setListError(null);
    try {
      const html = await fetchHtml(SITES[site] + '/');
      setList(parseHomeList(html, SITES[site]));
    } catch (e: any) {
      setListError(e?.message || '載入失敗');
    } finally {
      setLoadingList(false);
    }
  }

  function toggleFav(a: Anime) {
    setFavorites((prev) => {
      const k = favKey(a);
      const next = prev.some((x) => favKey(x) === k)
        ? prev.filter((x) => favKey(x) !== k)
        : [{ ...a }, ...prev];
      AsyncStorage.setItem('favorites', JSON.stringify(next));
      return next;
    });
  }

  async function openAnime(a: Anime) {
    setSelected(a);
    if (a.num && a.num > 0 && a.num <= 2000) {
      setChapters(buildChapters(a.site, a.slug, a.num));
      return;
    }
    setLoadingChapters(true);
    setChapters([]);
    try {
      const html = await fetchHtml(a.site + '/' + a.slug + '/');
      const re = new RegExp('href="(/' + a.slug + '-[0-9a-z-]+)"', 'g');
      const seen = new Set<string>();
      const out: Chapter[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (!seen.has(m[1])) {
          seen.add(m[1]);
          out.push({ ep: out.length + 1, url: a.site + m[1] });
        }
      }
      setChapters(out.length ? out : [{ ep: 1, url: a.latestUrl }]);
    } catch {
      setChapters([{ ep: 1, url: a.latestUrl }]);
    } finally {
      setLoadingChapters(false);
    }
  }

  async function playEpisode(url: string) {
    if (!selected) return;
    setResolving(true);
    setPlayError(null);
    try {
      const info = await parseEpisode(url);
      if (!info.streams.length) throw new Error('找唔到播放器來源');
      const ok = await loadStream(info.streams, 0);
      setCurrent({
        anime: selected,
        episodeUrl: url,
        episodeNo: info.episodeNo,
        streams: info.streams,
        streamIndex: 0,
        prevUrl: info.prevUrl,
        nextUrl: info.nextUrl,
      });
      if (fsOnPlay) setFullscreen(true);
      if (!ok) setPlayError('無法解析此來源，試下切換來源');
    } catch (e: any) {
      setPlayError(e?.message || '載入失敗');
    } finally {
      setResolving(false);
    }
  }

  async function loadStream(streams: Current['streams'], idx: number): Promise<boolean> {
    const src = await resolveSource(streams[idx].embedUrl);
    if (!isPlayable(src)) return false;
    let referer = '';
    try {
      referer = new URL(streams[idx].embedUrl).origin + '/';
    } catch {}
    const source: VideoSource = {
      uri: src!,
      contentType: src!.includes('.m3u8') ? 'hls' : 'auto',
      headers: { 'User-Agent': UA, Referer: referer },
    };
    player.replace(source);
    return true;
  }

  async function switchStream(idx: number) {
    if (!current) return;
    setResolving(true);
    setPlayError(null);
    const ok = await loadStream(current.streams, idx);
    setCurrent({ ...current, streamIndex: idx });
    if (!ok) setPlayError('此來源無法播放');
    setResolving(false);
  }

  // ===== 側欄清單分組 =====
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const src = tab === 'fav' ? favorites : list;
    const filtered = src.filter((a) => !q || a.search.includes(q) || a.slug.includes(q));
    if (tab === 'fav') {
      return filtered.length ? [{ title: '★ 我的最愛', data: filtered }] : [];
    }
    const groups: Record<string, Anime[]> = {};
    filtered.forEach((a) => {
      (groups[a.updateYear] ||= []).push(a);
    });
    return Object.keys(groups)
      .sort((x, y) => (y === '其他' ? -1 : x === '其他' ? 1 : Number(y) - Number(x)))
      .map((yr) => ({ title: yr === '其他' ? '其他' : `${yr} 年更新`, data: groups[yr] }));
  }, [list, favorites, query, tab]);

  // ===== 焦點輔助（讓遙控器 / 空中滑鼠可操作）=====
  const focusProps = (id: string) => ({
    focusable: true,
    onFocus: () => setFocusKey(id),
    onBlur: () => setFocusKey((k) => (k === id ? null : k)),
  });
  const focused = (id: string) => (focusKey === id ? s.focused : null);

  // ===== 集數分段（>50 集分頁，方便揀）=====
  const EP_BUCKET = 50;
  const epBuckets = useMemo(() => {
    if (chapters.length <= EP_BUCKET) return [] as { start: number; end: number; label: string }[];
    const out: { start: number; end: number; label: string }[] = [];
    for (let i = 0; i < chapters.length; i += EP_BUCKET) {
      const end = Math.min(i + EP_BUCKET, chapters.length);
      out.push({ start: i, end, label: `${chapters[i].ep}–${chapters[end - 1].ep}` });
    }
    return out;
  }, [chapters]);

  // 換動畫 → 重設分段
  useEffect(() => {
    setEpRange(0);
  }, [chapters]);

  // 切集 → 自動跳到該集所在分段
  useEffect(() => {
    if (!current || !epBuckets.length) return;
    const idx = chapters.findIndex((c) => c.url === current.episodeUrl);
    if (idx >= 0) setEpRange(Math.floor(idx / EP_BUCKET));
  }, [current?.episodeUrl, epBuckets.length]);

  const visibleChapters = epBuckets.length
    ? chapters.slice(epBuckets[epRange]?.start ?? 0, epBuckets[epRange]?.end ?? chapters.length)
    : chapters;

  const isPlaying = current?.episodeUrl;

  // 控制列自動隱藏（同原生控制一齊 show/hide）
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControls = () => {
    setCtrlShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlShown(false), 3500);
  };
  useEffect(() => {
    if (!isPlaying) return;
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [current?.episodeUrl, fullscreen, isPlaying]);

  // 返回鍵：全螢幕時 → 退出全螢幕（唔關 app）；否則行預設（離開 app）
  useEffect(() => {
    const onBack = () => {
      if (fullscreen) {
        setFullscreen(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [fullscreen]);

  // 遙控器按鍵（只喺全螢幕生效）：OK=播放/暫停, 上=上集, 下=下集, 左/右=倒退/快進
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('hwKey', (name: string) => {
      if (!fullscreen) return;
      showControls();
      try {
        if (name === 'ok') {
          if (player.playing) player.pause();
          else player.play();
        } else if (name === 'up') {
          if (current?.prevUrl) playEpisode(current.prevUrl);
        } else if (name === 'down') {
          if (current?.nextUrl) playEpisode(current.nextUrl);
        } else if (name === 'left') {
          player.currentTime = Math.max(0, player.currentTime - 10);
        } else if (name === 'right') {
          player.currentTime = player.currentTime + 10;
        }
      } catch {}
    });
    return () => sub.remove();
  }, [fullscreen, current?.episodeUrl, current?.prevUrl, current?.nextUrl]);

  // 播放器（普通／全螢幕共用同一個 VideoView）
  const playerNode = (
    <>
      <VideoView
        player={player}
        style={s.video}
        nativeControls={ctrlShown}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
      />
      {/* 收起時：透明感應層，撳一下／D-pad 重新顯示 */}
      {!ctrlShown && (
        <Pressable focusable={!fullscreen} style={s.tapCatcher} onPress={showControls} />
      )}
      {/* 疊層：上集 / 下集 */}
      {ctrlShown && current && (
        <>
          <Pressable
            {...focusProps('ov-prev')}
            focusable={!fullscreen}
            disabled={!current.prevUrl}
            style={[s.ovBtn, s.ovLeft, !current.prevUrl && s.ovOff, focused('ov-prev')]}
            onPress={() => current.prevUrl && playEpisode(current.prevUrl)}>
            <Text style={s.ovText}>‹{'\n'}上{'\n'}集</Text>
          </Pressable>
          <Pressable
            {...focusProps('ov-next')}
            focusable={!fullscreen}
            disabled={!current.nextUrl}
            style={[s.ovBtn, s.ovRight, !current.nextUrl && s.ovOff, focused('ov-next')]}
            onPress={() => current.nextUrl && playEpisode(current.nextUrl)}>
            <Text style={s.ovText}>下{'\n'}集{'\n'}›</Text>
          </Pressable>
        </>
      )}
      {/* 全螢幕：退出 / 進入 掣 */}
      {ctrlShown && (
        <Pressable
          {...focusProps('fs-toggle')}
          focusable={!fullscreen}
          style={[s.fsToggle, fullscreen && s.fsToggleFs, focused('fs-toggle')]}
          onPress={() => setFullscreen((f) => !f)}>
          <Text style={s.fsToggleText}>{fullscreen ? '⤢ 退出全螢幕' : '⛶ 全螢幕'}</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={s.root}>
      <StatusBar style="light" hidden={fullscreen} />

      {/* ===== 左側欄 ===== */}
      {!sidebarOpen && (
        <Pressable
          {...focusProps('sb-open')}
          style={[s.railBar, focused('sb-open')]}
          onPress={() => setSidebarOpen(true)}>
          <Text style={s.railIcon}>☰</Text>
        </Pressable>
      )}
      {sidebarOpen && (
      <View style={s.sidebar}>
        <View style={s.brandRow}>
          <Pressable
            {...focusProps('sb-collapse')}
            hitSlop={6}
            style={[s.collapseBtn, focused('sb-collapse')]}
            onPress={() => setSidebarOpen(false)}>
            <Text style={s.collapseIcon}>‹</Text>
          </Pressable>
          <View style={s.dot} />
          <Text style={s.brand}>Anime1 Player</Text>
        </View>

        <TextInput
          style={s.search}
          placeholder="🔍  搜尋動畫…"
          placeholderTextColor={C.dim}
          value={query}
          onChangeText={setQuery}
        />

        <View style={s.toggleRow}>
          {(['in', 'one'] as const).map((k) => (
            <Pressable
              key={k}
              {...focusProps('site-' + k)}
              style={[s.toggle, siteKey === k && s.toggleOn, focused('site-' + k)]}
              onPress={() => {
                setSiteKey(k);
                setSelected(null);
              }}>
              <Text style={[s.toggleText, siteKey === k && s.toggleTextOn]}>anime1.{k}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.toggleRow}>
          <Pressable
            {...focusProps('tab-all')}
            style={[s.toggle, tab === 'all' && s.toggleOn, focused('tab-all')]}
            onPress={() => setTab('all')}>
            <Text style={[s.toggleText, tab === 'all' && s.toggleTextOn]}>全部</Text>
          </Pressable>
          <Pressable
            {...focusProps('tab-fav')}
            style={[s.toggle, tab === 'fav' && s.toggleFav, focused('tab-fav')]}
            onPress={() => setTab('fav')}>
            <Text style={[s.toggleText, tab === 'fav' && s.toggleTextOn]}>♥ 我的最愛 {favorites.length || ''}</Text>
          </Pressable>
        </View>

        {loadingList && tab === 'all' ? (
          <ActivityIndicator color={C.cyan} style={{ marginTop: 24 }} />
        ) : listError && tab === 'all' ? (
          <Text style={s.err}>❌ {listError}</Text>
        ) : sections.length === 0 ? (
          <Text style={s.empty}>{tab === 'fav' ? '仲未加任何最愛\n撳清單右邊 ♡ 加入' : '（無符合）'}</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(a) => favKey(a)}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <Text style={s.sectionHeader}>
                {section.title}
                <Text style={s.sectionCount}> · {section.data.length}</Text>
              </Text>
            )}
            renderItem={({ item }) => {
              const k = favKey(item);
              const fav = favSet.has(k);
              const active = selected && favKey(selected) === k;
              return (
                <View style={[s.row, active && s.rowActive, focused('row-' + k) && s.rowFocused]}>
                  <Pressable
                    {...focusProps('row-' + k)}
                    style={s.rowMain}
                    onPress={() => openAnime(item)}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={s.rowMeta}>
                      {item.cntText} · {item.update}
                      {tab === 'fav' ? `  · anime1.${item.site.includes('.one') ? 'one' : 'in'}` : ''}
                    </Text>
                  </Pressable>
                  <Pressable
                    {...focusProps('heart-' + k)}
                    hitSlop={8}
                    style={[s.heart, focused('heart-' + k)]}
                    onPress={() => toggleFav(item)}>
                    <Text style={[s.heartIcon, fav && s.heartOn]}>{fav ? '♥' : '♡'}</Text>
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
      )}

      {/* ===== 右側主區 ===== */}
      <View style={s.main}>
        <View style={s.playerArea}>
          {isPlaying && !fullscreen ? (
            playerNode
          ) : (
            <View style={s.placeholder}>
              <Text style={s.placeholderText}>
                {fullscreen ? '🔳 全螢幕播放中…' : selected ? '揀一集開始播放' : '←  喺左邊揀一套動畫'}
              </Text>
            </View>
          )}
        </View>

        {playError && <Text style={s.err}>{playError}</Text>}

        {/* ===== 下方：左 70% 集數 ／ 右 30% 控制 ===== */}
        {selected && (
          <View style={s.bottomSplit}>
            {/* 左：集數選擇 */}
            <View style={s.chapPane}>
              {loadingChapters ? (
                <ActivityIndicator color={C.cyan} style={{ marginTop: 16 }} />
              ) : (
                <>
                  <View style={s.chapTopRow}>
                    {current && (
                      <Pressable
                        {...focusProps('prev')}
                        style={[s.btn, !current.prevUrl && s.btnOff, focused('prev')]}
                        disabled={!current.prevUrl}
                        onPress={() => current.prevUrl && playEpisode(current.prevUrl)}>
                        <Text style={s.btnText}>‹ 上集</Text>
                      </Pressable>
                    )}
                    {current && (
                      <Pressable
                        {...focusProps('next')}
                        style={[s.btn, s.btnRose, !current.nextUrl && s.btnOff, focused('next')]}
                        disabled={!current.nextUrl}
                        onPress={() => current.nextUrl && playEpisode(current.nextUrl)}>
                        <Text style={s.btnText}>下集 ›</Text>
                      </Pressable>
                    )}
                    {epBuckets.length > 0 ? (
                      <FlatList
                        style={s.rangeRow}
                        data={epBuckets}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(b) => b.label}
                        extraData={[epRange, focusKey]}
                        renderItem={({ item, index }) => {
                          const on = index === epRange;
                          return (
                            <Pressable
                              {...focusProps('rng-' + index)}
                              style={[s.range, on && s.rangeOn, focused('rng-' + index)]}
                              onPress={() => setEpRange(index)}>
                              <Text style={[s.rangeText, on && s.rangeTextOn]}>{item.label}</Text>
                            </Pressable>
                          );
                        }}
                      />
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                  </View>
                  <ScrollView style={s.epGrid} contentContainerStyle={s.epWrap}>
                    {visibleChapters.map((item) => {
                      const on = current?.episodeUrl === item.url;
                      return (
                        <Pressable
                          key={item.url}
                          {...focusProps('ep-' + item.url)}
                          style={[s.ep, on && s.epOn, focused('ep-' + item.url)]}
                          onPress={() => playEpisode(item.url)}>
                          <Text style={[s.epText, on && s.epTextOn]}>第{item.ep}集</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </View>

            {/* 右：控制 */}
            <View style={s.ctrlPane}>
              <Text style={s.nowTitle} numberOfLines={2}>
                {current ? current.anime.name : selected.name}
              </Text>
              <View style={s.ctrlMetaRow}>
                {current && <Text style={s.nowEp}>第 {current.episodeNo} 集</Text>}
                <Pressable
                  {...focusProps('now-fav')}
                  hitSlop={8}
                  style={[s.favWrap, focused('now-fav')]}
                  onPress={() => toggleFav(current ? current.anime : selected)}>
                  <Text
                    style={[
                      s.favText,
                      favSet.has(favKey(current ? current.anime : selected)) && s.heartOn,
                    ]}>
                    {favSet.has(favKey(current ? current.anime : selected)) ? '♥ 已收藏' : '♡ 加入最愛'}
                  </Text>
                </Pressable>
              </View>
              {current && (
                <View style={s.skipWrap}>
                  <Text style={s.skipLabel}>跳秒</Text>
                  <TextInput
                    onFocus={() => setFocusKey('skip')}
                    onBlur={() => setFocusKey((k) => (k === 'skip' ? null : k))}
                    style={[s.skipInput, focused('skip')]}
                    keyboardType="numeric"
                    value={skip}
                    onChangeText={(t) => {
                      setSkip(t);
                      AsyncStorage.setItem('skip', t);
                    }}
                  />
                  {resolving && <ActivityIndicator color={C.cyan} style={{ marginLeft: 6 }} />}
                </View>
              )}
              {current && current.streams.length > 0 && (
                <View style={s.srcRow}>
                  <Text style={s.srcLabel}>來源</Text>
                  <Pressable
                    {...focusProps('src-sel')}
                    style={[s.srcSel, focused('src-sel')]}
                    onPress={() => setSrcOpen(true)}>
                    <Text style={s.srcSelText} numberOfLines={1}>
                      {current.streams[current.streamIndex]?.label ?? '—'}
                    </Text>
                    <Text style={s.srcCaret}>▾</Text>
                  </Pressable>
                </View>
              )}
              {current && (
                <View style={s.fsRow}>
                  <Pressable
                    {...focusProps('fs-enter')}
                    style={[s.fsEnterBtn, focused('fs-enter')]}
                    onPress={() => setFullscreen(true)}>
                    <Text style={s.fsEnterText}>⛶ 全螢幕</Text>
                  </Pressable>
                  <Pressable
                    {...focusProps('fs-onplay')}
                    style={[s.fsChk, fsOnPlay && s.fsChkOn, focused('fs-onplay')]}
                    onPress={() => {
                      const v = !fsOnPlay;
                      setFsOnPlay(v);
                      AsyncStorage.setItem('fsOnPlay', v ? '1' : '0');
                    }}>
                    <Text style={[s.fsChkText, fsOnPlay && s.fsChkTextOn]}>
                      {fsOnPlay ? '☑' : '☐'} 播放即全螢幕
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ===== 全螢幕覆蓋（自訂，保留疊層上/下集）===== */}
      {fullscreen && isPlaying && <View style={s.fsContainer}>{playerNode}</View>}

      {/* ===== 來源選單（自訂下拉，細字）===== */}
      <Modal visible={srcOpen} transparent animationType="fade" onRequestClose={() => setSrcOpen(false)}>
        <Pressable style={s.srcBackdrop} onPress={() => setSrcOpen(false)}>
          <View style={s.srcMenu}>
            <Text style={s.srcMenuTitle}>選擇來源</Text>
            <ScrollView>
              {current?.streams.map((st, i) => {
                const on = i === current.streamIndex;
                return (
                  <Pressable
                    key={i}
                    {...focusProps('srcm-' + i)}
                    style={[s.srcItem, on && s.srcItemOn, focused('srcm-' + i)]}
                    onPress={() => {
                      switchStream(i);
                      setSrcOpen(false);
                    }}>
                    <Text style={[s.srcItemText, on && s.srcItemTextOn]}>{st.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.ground, paddingTop: 24 },

  // 焦點高亮（遙控器 / 空中滑鼠）
  focused: { borderColor: C.cyan, borderWidth: 2, backgroundColor: '#2f2942' },
  rowFocused: { backgroundColor: '#2f2942' },

  // 收合 / 展開
  railBar: {
    width: 40,
    backgroundColor: C.panel,
    borderRightWidth: 1,
    borderRightColor: C.line,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
  },
  railIcon: { color: C.cyan, fontSize: 22, fontWeight: '800' },
  collapseBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseIcon: { color: C.text, fontSize: 18, fontWeight: '800', lineHeight: 20 },

  // 側欄
  sidebar: { width: 320, backgroundColor: C.panel, borderRightWidth: 1, borderRightColor: C.line, padding: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.rose },
  brand: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  search: {
    backgroundColor: C.ground,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: C.text,
    marginBottom: 8,
  },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  toggle: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  toggleFav: { backgroundColor: C.rose, borderColor: C.rose },
  toggleText: { color: C.dim, fontSize: 12, fontWeight: '700' },
  toggleTextOn: { color: '#0B0A12' },
  sectionHeader: {
    color: C.rose,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sectionCount: { color: C.dim, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  rowActive: { backgroundColor: '#241f33', borderLeftWidth: 3, borderLeftColor: C.cyan },
  rowMain: { flex: 1, paddingVertical: 10, paddingLeft: 6 },
  rowName: { color: C.text, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: C.dim, fontSize: 11, marginTop: 2 },
  heart: { paddingHorizontal: 10, paddingVertical: 8 },
  heartIcon: { color: C.dim, fontSize: 18, fontWeight: '700' },
  heartOn: { color: C.rose },
  empty: { color: C.dim, textAlign: 'center', marginTop: 28, lineHeight: 22 },
  err: { color: '#ff7a90', padding: 8 },

  // 主區
  main: { flex: 1, padding: 12 },
  playerArea: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0c0b12' },
  video: { flex: 1, backgroundColor: '#000' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16131f',
  },
  placeholderText: { color: C.dim, fontSize: 16 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  nowTitle: { color: C.text, fontSize: 11, fontWeight: '800', flexShrink: 1 },
  nowEp: { color: C.cyan, fontSize: 9 },
  favText: { color: C.dim, fontSize: 11, fontWeight: '700' },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 4 },
  btn: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  btnRose: { backgroundColor: C.rose, borderColor: C.rose },
  btnCyan: { backgroundColor: C.cyan, borderColor: C.cyan },
  btnOff: { opacity: 0.4 },
  btnText: { color: C.text, fontSize: 8, fontWeight: '700' },
  btnTextDark: { color: '#0B0A12' },
  skipWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  skipLabel: { color: C.dim, fontSize: 8 },
  skipInput: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    width: 44,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
    textAlign: 'center',
    fontSize: 9,
  },
  epStrip: { paddingTop: 10, minHeight: 48 },
  ep: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  epOn: { backgroundColor: C.rose, borderColor: C.rose },
  epText: { color: C.text, fontSize: 8, fontWeight: '700' },
  epTextOn: { color: '#0B0A12' },

  // 來源（精簡分段）
  srcGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  srcLabel: { color: C.dim, fontSize: 8, fontWeight: '700', marginRight: 2 },
  srcPill: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: 90,
  },
  srcText: { color: C.text, fontSize: 12, fontWeight: '700' },

  // 集數分段標籤
  rangeRow: { maxHeight: 38, marginBottom: 8 },
  range: {
    backgroundColor: C.ground,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  rangeOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  rangeText: { color: C.dim, fontSize: 8, fontWeight: '800' },
  rangeTextOn: { color: '#0B0A12' },

  // 播放器疊層：上集 / 下集
  ovBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -36,
    width: 46,
    height: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(18,16,26,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovLeft: { left: 10 },
  ovRight: { right: 10 },
  ovOff: { opacity: 0.25 },
  ovText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 18 },

  // 下方左右分割
  bottomSplit: { flexDirection: 'row', height: '30%', gap: 12, paddingTop: 8 },
  chapPane: { flex: 7 },
  chapTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  epGrid: { flex: 1 },
  epWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },

  ctrlPane: {
    flex: 3,
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
    paddingLeft: 12,
  },
  ctrlMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  favWrap: { borderRadius: 8 },
  srcRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 自訂來源下拉（細字）
  srcSel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  srcSelText: { color: C.text, fontSize: 9, fontWeight: '700', flexShrink: 1 },
  srcCaret: { color: C.dim, fontSize: 9, marginLeft: 4 },
  srcBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcMenu: {
    width: 200,
    maxHeight: '70%',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 8,
  },
  srcMenuTitle: { color: C.dim, fontSize: 9, fontWeight: '800', marginBottom: 6, paddingHorizontal: 4 },
  srcItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  srcItemOn: { backgroundColor: C.cyan, borderColor: C.cyan },
  srcItemText: { color: C.text, fontSize: 10, fontWeight: '700' },
  srcItemTextOn: { color: '#0B0A12' },

  // 控制列感應層
  tapCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // 全螢幕
  fsContainer: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 100,
    elevation: 100,
  },
  fsToggle: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(18,16,26,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  // 全螢幕：退出掣放低啲、大啲、明顯啲（避開投影機 overscan）
  fsToggleFs: {
    top: 56,
    right: 40,
    backgroundColor: 'rgba(255,77,141,0.92)',
    borderColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  fsToggleText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  fsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fsEnterBtn: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.cyan,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  fsEnterText: { color: C.cyan, fontSize: 9, fontWeight: '800' },
  fsChk: { paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6 },
  fsChkOn: {},
  fsChkText: { color: C.dim, fontSize: 9, fontWeight: '700' },
  fsChkTextOn: { color: C.cyan },
});
