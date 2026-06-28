import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer, type VideoSource } from 'expo-video';
import * as Updates from 'expo-updates';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
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
import { getAdRanges, adSkipTarget, type AdRange } from './lib/adskip';
import {
  signup as syncSignup,
  login as syncLogin,
  pull as syncPull,
  push as syncPush,
  mergeFavorites,
  mergeByRecency,
} from './lib/sync';

// ===== 配色（style3 vibrant streaming base）=====
const C = {
  ink: '#0B0E1A',
  bg: '#0E1322',
  surface: '#141A2E',
  raised: '#1B2440',
  raised2: '#222C4E',
  line: 'rgba(255,255,255,0.07)',
  line2: 'rgba(255,255,255,0.12)',
  text: '#F4F6FF',
  muted: '#8A92B2',
  mutedDim: '#646E92',
  rose: '#FF4D8D',
  violet: '#9B5CFF',
  cyan: '#34E1E8',
  good: '#5BE6A8',
  amber: '#FFB23E',
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
  streams: { label: string; embedUrl: string; ms?: number }[];
  streamIndex: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

interface Progress {
  url: string;
  ep: string;
  time: number;
  at?: number;
}

const favKey = (a: { site: string; slug: string }) => a.site + '|' + a.slug;

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s2 = Math.floor(sec % 60);
  return `${m}:${s2 < 10 ? '0' : ''}${s2}`;
}

// 自訂播放控制（取代原生控制，等疊層上/下集同播放控制一齊 show/hide）
function PlayerOverlay(props: {
  player: any;
  current: Current | null;
  ctrlShown: boolean;
  fullscreen: boolean;
  showControls: () => void;
  hideControls: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFs: () => void;
  mark: { start?: number; end?: number; at?: number } | undefined;
  onSetStart: () => void;
  onSetEnd: () => void;
  onClearStart: () => void;
  onClearEnd: () => void;
  focusProps: (id: string) => any;
  focused: (id: string) => any;
}) {
  const {
    player, current, ctrlShown, fullscreen,
    showControls, hideControls, onPrev, onNext, onToggleFs,
    mark, onSetStart, onSetEnd, onClearStart, onClearEnd, focusProps, focused,
  } = props;
  const [pos, setPos] = useState({ t: 0, d: 0 });
  const [playing, setPlaying] = useState(true);
  const [barW, setBarW] = useState(0);
  const barWRef = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const shownRef = useRef(ctrlShown);
  shownRef.current = ctrlShown;

  useEventListener(player, 'timeUpdate', () => {
    if (!shownRef.current || dragRef.current != null) return;
    let t = 0;
    let d = 0;
    try {
      t = player.currentTime || 0;
      d = player.duration || 0;
    } catch {}
    setPos({ t, d });
  });
  useEventListener(player, 'playingChange', () => {
    try {
      setPlaying(player.playing);
    } catch {}
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        dragRef.current = x;
        setDrag(x);
        showControls();
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        dragRef.current = x;
        setDrag(x);
      },
      onPanResponderRelease: () => {
        const x = dragRef.current ?? 0;
        const w = barWRef.current;
        const ratio = w > 0 ? Math.min(1, Math.max(0, x / w)) : 0;
        try {
          player.currentTime = ratio * (player.duration || 0);
        } catch {}
        dragRef.current = null;
        setDrag(null);
        showControls();
      },
    })
  ).current;

  const d = pos.d;
  const t = drag != null && barWRef.current > 0 ? (drag / barWRef.current) * d : pos.t;
  const pct = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
  const seekBy = (n: number) => {
    try {
      player.currentTime = Math.max(0, (player.currentTime || 0) + n);
    } catch {}
    showControls();
  };
  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
    showControls();
  };

  return (
    <>
      {/* 感應層：收起時撳一下顯示；顯示時撳空白收起 */}
      {!ctrlShown ? (
        <Pressable focusable={!fullscreen} style={s.tapCatcher} onPress={showControls} />
      ) : (
        <Pressable focusable={false} style={s.tapCatcher} onPress={hideControls} />
      )}

      {ctrlShown && (
        <>
          {/* 全螢幕：頂部置中片名 + 集數 */}
          {fullscreen && current && (
            <View style={s.fsTopBar} pointerEvents="none">
              <Text style={s.fsTopName} numberOfLines={1}>
                ★ {current.anime.name} ★
              </Text>
              <Text style={s.fsTopEp}>第 {current.episodeNo} 集</Text>
            </View>
          )}

          {/* 中央：倒退10 / 播放暫停 / 快進10 */}
          <View style={s.ctrCenter} pointerEvents="box-none">
            <Pressable
              {...focusProps('seek-back')}
              focusable={!fullscreen}
              style={[s.ctrBtn, focused('seek-back')]}
              onPress={() => seekBy(-10)}>
              <Text style={s.ctrIcon}>⟲</Text>
              <Text style={s.ctrIconSm}>10</Text>
            </Pressable>
            <Pressable
              {...focusProps('play')}
              focusable={!fullscreen}
              style={[s.ctrPlay, focused('play')]}
              onPress={togglePlay}>
              <Text style={s.ctrPlayIcon}>{playing ? 'II' : '▶'}</Text>
            </Pressable>
            <Pressable
              {...focusProps('seek-fwd')}
              focusable={!fullscreen}
              style={[s.ctrBtn, focused('seek-fwd')]}
              onPress={() => seekBy(10)}>
              <Text style={s.ctrIcon}>⟳</Text>
              <Text style={s.ctrIconSm}>10</Text>
            </Pressable>
          </View>

          {/* 邊緣：上集 / 下集 */}
          {current && (
            <>
              <Pressable
                {...focusProps('ov-prev')}
                focusable={!fullscreen}
                disabled={!current.prevUrl}
                style={[s.ovBtn, s.ovLeft, !current.prevUrl && s.ovOff, focused('ov-prev')]}
                onPress={onPrev}>
                <Text style={s.ovText}>‹{'\n'}上{'\n'}集</Text>
              </Pressable>
              <Pressable
                {...focusProps('ov-next')}
                focusable={!fullscreen}
                disabled={!current.nextUrl}
                style={[s.ovBtn, s.ovRight, !current.nextUrl && s.ovOff, focused('ov-next')]}
                onPress={onNext}>
                <Text style={s.ovText}>下{'\n'}集{'\n'}›</Text>
              </Pressable>
            </>
          )}

          {/* 全螢幕 */}
          <Pressable
            {...focusProps('fs-toggle')}
            focusable={!fullscreen}
            style={[s.fsToggle, fullscreen && s.fsToggleFs, focused('fs-toggle')]}
            onPress={onToggleFs}>
            <Text style={s.fsToggleText}>{fullscreen ? '⤢ 退出全螢幕' : '⛶ 全螢幕'}</Text>
          </Pressable>

          {/* 開頭／結尾 標記（設開頭貼左、設結尾貼右）—— 可 touch + 遙控/空中滑鼠 focus */}
          {current && (
            <View style={s.markRow} pointerEvents="box-none">
              <View style={s.markGroup}>
                <Pressable {...focusProps('set-start')} style={[s.markBtn, focused('set-start')]} onPress={onSetStart}>
                  <Text style={s.markBtnText}>⏮ 設開頭 {mark?.start == null ? '—' : fmtTime(mark.start)}</Text>
                </Pressable>
                {mark?.start != null && (
                  <Pressable {...focusProps('clr-start')} style={[s.markClear, focused('clr-start')]} onPress={onClearStart}>
                    <Text style={s.markClearText}>✕</Text>
                  </Pressable>
                )}
              </View>
              <View style={s.markGroup}>
                {mark?.end != null && (
                  <Pressable {...focusProps('clr-end')} style={[s.markClear, focused('clr-end')]} onPress={onClearEnd}>
                    <Text style={s.markClearText}>✕</Text>
                  </Pressable>
                )}
                <Pressable {...focusProps('set-end')} style={[s.markBtn, focused('set-end')]} onPress={onSetEnd}>
                  <Text style={s.markBtnText}>設結尾 {mark?.end == null ? '—' : fmtTime(mark.end)} ⏭</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 底部：時間 + 進度條（可拖） */}
          <View style={s.seekRow} pointerEvents="box-none">
            <Text style={s.timeText}>
              {fmtTime(t)} / {fmtTime(d)}
            </Text>
            <View
              style={s.seekBarWrap}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                barWRef.current = w;
                setBarW(w);
              }}
              {...pan.panHandlers}>
              <View style={s.seekTrack} />
              <View style={[s.seekFill, { width: pct * barW }]} />
              <View style={[s.seekKnob, { left: pct * barW - 8 }]} />
            </View>
          </View>
        </>
      )}
    </>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= height;

  const [siteKey, setSiteKey] = useState<SiteKey>('in');
  const [lists, setLists] = useState<Record<string, Anime[]>>({}); // 每個站台一份清單（合併顯示）
  // 來源篩選：揀用邊幾個主來源（預設全選）；撳 [A1] 開選單
  const [enabledSites, setEnabledSites] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(SITES).map((k) => [k, true]))
  );
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const [favorites, setFavorites] = useState<Anime[]>([]);
  const favSet = useMemo(() => new Set(favorites.map(favKey)), [favorites]);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

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
  const [gridW, setGridW] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  // 播放器單一掛載：佔位槽幾何（螢幕座標，相對 root）。host 永遠掛喺 root 尾段，只改 style，唔 reparent → 切全螢幕唔再黑畫面
  const [slot, setSlot] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const rootRef = useRef<View>(null);
  const playerSlotRef = useRef<View>(null);
  const [fsOnPlay, setFsOnPlay] = useState(false);
  const [ctrlShown, setCtrlShown] = useState(true);
  const [srcOpen, setSrcOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [preferredLabel, setPreferredLabel] = useState<string | null>(null);
  const preferredRef = useRef<string | null>(null);
  useEffect(() => {
    preferredRef.current = preferredLabel;
  });

  // 切來源續播位置 + 每套續看進度 + 來源選單游標
  const resumeAtRef = useRef<number | null>(null);
  const seekedRef = useRef(false); // 每次載入只做一次初始 seek（避免 readyToPlay 重複觸發跳秒卡住）
  const adRangesRef = useRef<AdRange[]>([]); // 本來源偵測到嘅廣告區間（自動跳過用）
  const [adSkipNote, setAdSkipNote] = useState(false); // 跳過廣告時短暫顯示提示
  const adNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<Record<string, Progress>>({});
  const lastSaveRef = useRef(0);
  const [srcHi, setSrcHi] = useState(0);
  const srcHiRef = useRef(0);
  const srcOpenRef = useRef(false);
  const siteOpenRef = useRef(false);
  const fullscreenRef = useRef(false);
  useEffect(() => {
    srcOpenRef.current = srcOpen;
  }, [srcOpen]);
  useEffect(() => {
    siteOpenRef.current = siteOpen;
  }, [siteOpen]);
  useEffect(() => {
    fullscreenRef.current = fullscreen;
  }, [fullscreen]);
  const setSrcHiBoth = (i: number) => {
    srcHiRef.current = i;
    setSrcHi(i);
  };

  // 逐套 Start/End 標記（key = site|slug）；marksRef 俾一次性 listener 讀最新值
  const [marks, setMarks] = useState<Record<string, { start?: number; end?: number; at?: number }>>({});
  const marksRef = useRef<Record<string, { start?: number; end?: number; at?: number }>>({});
  const startAtRef = useRef<number | null>(null); // 今次載入要套用嘅開頭（喺 replace 前擷取）
  const endFiredRef = useRef(false); // 今次載入已觸發 End 跳集
  const endArmedRef = useRef(false); // 觀察到 currentTime < end 後先 arm
  const lastAdvanceRef = useRef(0); // 上次 End 自動跳集時間（wall-clock rate-limit）
  const focusKeyRef = useRef<string | null>(null); // 俾 hwKey 讀目前 focus（遙控設標記）

  // 雲端同步（登入後 favorites/progress/marks 跨裝置）
  const [syncUser, setSyncUser] = useState<string | null>(null);
  const syncTokenRef = useRef<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncName, setSyncName] = useState('');
  const [syncPass, setSyncPass] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false); // OTA：已下載新版本，等用戶確認 reload
  const [updateNotes, setUpdateNotes] = useState<string | null>(null); // OTA：新版本嘅「更新內容」
  const favoritesRef = useRef<Anime[]>([]);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
  });

  const currentRef = useRef<Current | null>(null);
  useEffect(() => {
    currentRef.current = current;
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      // 只喺今次載入第一次 ready 做初始 seek，之後 re-buffer 唔再跳
      if (!seekedRef.current) {
        seekedRef.current = true;
        if (resumeAtRef.current != null) {
          // 切來源／續看：seek 返到指定秒數
          try {
            player.currentTime = resumeAtRef.current;
          } catch {}
          resumeAtRef.current = null;
        } else if (startAtRef.current != null && startAtRef.current > 0) {
          // 逐套開頭：跳過片頭（取代舊全域跳秒）
          try {
            player.currentTime = startAtRef.current;
          } catch {}
        }
        startAtRef.current = null;
      }
      player.play();
    }
  });

  // 記錄每套動畫的播放進度（節流存檔）
  useEventListener(player, 'timeUpdate', () => {
    const c = currentRef.current;
    if (!c) return;
    let t = 0;
    try {
      t = player.currentTime || 0;
    } catch {}
    // 自動跳過廣告：currentTime 落入偵測到嘅廣告區間 → 跳去區間結尾
    if (adRangesRef.current.length) {
      const target = adSkipTarget(t, adRangesRef.current);
      if (target != null) {
        try {
          player.currentTime = target;
        } catch {}
        t = target;
        setAdSkipNote(true);
        if (adNoteTimer.current) clearTimeout(adNoteTimer.current);
        adNoteTimer.current = setTimeout(() => setAdSkipNote(false), 1800);
      }
    }
    // 逐套 End：到結尾自動跳下一集（多重保護避免「整個系列秒跳」）
    const mk = marksRef.current[favKey(c.anime)];
    const end = mk?.end;
    const start = mk?.start ?? 0;
    if (end != null && end > start && seekedRef.current) {
      if (!endArmedRef.current && t < end) endArmedRef.current = true; // 觀察到 t<end 先 arm
      if (
        endArmedRef.current &&
        !endFiredRef.current &&
        t >= end &&
        c.nextUrl &&
        Date.now() - lastAdvanceRef.current > 5000
      ) {
        endFiredRef.current = true;
        lastAdvanceRef.current = Date.now();
        // 防 resume 中毒：將進度指去下一集（time 0），唔好停喺被跳過嗰集嘅結尾
        progressRef.current[favKey(c.anime)] = { url: c.nextUrl, ep: c.episodeNo, time: 0, at: Date.now() };
        AsyncStorage.setItem('progress', JSON.stringify(progressRef.current));
        scheduleSyncPush();
        playEpisode(c.nextUrl, c.anime);
        return;
      }
    }
    // 已觸發 End → 停止為當前 load 再寫進度（避免再寫返結尾位置）
    if (endFiredRef.current) return;

    progressRef.current[favKey(c.anime)] = { url: c.episodeUrl, ep: c.episodeNo, time: t, at: Date.now() };
    const now = Date.now();
    if (now - lastSaveRef.current > 5000) {
      lastSaveRef.current = now;
      AsyncStorage.setItem('progress', JSON.stringify(progressRef.current));
      scheduleSyncPush();
    }
  });

  // 播完自動跳下一集
  useEventListener(player, 'playToEnd', () => {
    const c = currentRef.current;
    if (c?.nextUrl) playEpisode(c.nextUrl, c.anime);
  });

  // 載入設定 + 我的最愛
  useEffect(() => {
    (async () => {
      const [s, mk, fav, fop, srcl, prog, esites, sUser, sToken] = await Promise.all([
        AsyncStorage.getItem('site'),
        AsyncStorage.getItem('marks'),
        AsyncStorage.getItem('favorites'),
        AsyncStorage.getItem('fsOnPlay'),
        AsyncStorage.getItem('srcLabel'),
        AsyncStorage.getItem('progress'),
        AsyncStorage.getItem('enabledSites'),
        AsyncStorage.getItem('syncUser'),
        AsyncStorage.getItem('syncToken'),
      ]);
      if (sUser && sToken) {
        setSyncUser(sUser);
        syncTokenRef.current = sToken;
      }
      if (s === 'in' || s === 'one') setSiteKey(s);
      if (mk) {
        try {
          const parsed = JSON.parse(mk);
          if (parsed && typeof parsed === 'object') {
            marksRef.current = parsed;
            setMarks(parsed);
          }
        } catch {}
      }
      if (esites) {
        try {
          const saved = JSON.parse(esites) as Record<string, boolean>;
          // 以目前 SITES 為準補齊（新增站台預設開）
          setEnabledSites(
            Object.fromEntries(Object.keys(SITES).map((k) => [k, saved[k] ?? true]))
          );
        } catch {}
      }
      if (fop === '1') setFsOnPlay(true);
      if (srcl) setPreferredLabel(srcl);
      if (prog) {
        try {
          progressRef.current = JSON.parse(prog);
        } catch {}
      }
      if (fav) {
        try {
          const arr = JSON.parse(fav);
          favoritesRef.current = arr;
          setFavorites(arr);
        } catch {}
      }
      // 已登入 → 開 app 即刻拉一次雲端最新，merge 落本機
      if (sUser && sToken) {
        try {
          const remote = await syncPull(sToken);
          const mf = mergeFavorites(favoritesRef.current, remote.favorites || [], favKey);
          const mp = mergeByRecency(progressRef.current, remote.progress || {});
          const mm = mergeByRecency(marksRef.current, remote.marks || {});
          favoritesRef.current = mf;
          setFavorites(mf);
          AsyncStorage.setItem('favorites', JSON.stringify(mf));
          progressRef.current = mp;
          AsyncStorage.setItem('progress', JSON.stringify(mp));
          marksRef.current = mm;
          setMarks(mm);
          AsyncStorage.setItem('marks', JSON.stringify(mm));
        } catch {}
      }
    })();
  }, []);

  // 兩站合併：開 app 同時刷新 in + one（cache-first，背景更新）
  useEffect(() => {
    (Object.keys(SITES) as SiteKey[]).forEach((s) => loadList(s));
  }, []);

  // 開 app 即刻由兩站快取 hydrate，等清單即時有嘢（唔等網路，快）
  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        (Object.keys(SITES) as SiteKey[]).map(async (s) => {
          try {
            const c = await AsyncStorage.getItem('list:' + s);
            const arr = c ? JSON.parse(c) : null;
            return [s, Array.isArray(arr) ? arr : null] as const;
          } catch {
            return [s, null] as const;
          }
        })
      );
      const next: Record<string, Anime[]> = {};
      for (const [s, arr] of entries) if (arr?.length) next[s] = arr;
      // 已有（剛 fetch 嘅最新）優先，唔好被快取蓋過
      if (Object.keys(next).length) setLists((prev) => ({ ...next, ...prev }));
    })();
  }, []);

  async function loadList(site: SiteKey) {
    // 先即刻顯示本地快取（若有），唔使等網路
    let hadCache = false;
    try {
      const cached = await AsyncStorage.getItem('list:' + site);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length) {
          setLists((prev) => ({ ...prev, [site]: arr }));
          hadCache = true;
        }
      }
    } catch {}
    // 冇快取先轉圈；有快取就背景靜靜更新
    if (!hadCache) setLoadingList(true);
    setListError(null);
    try {
      const html = await fetchHtml(SITES[site] + '/');
      const fresh = parseHomeList(html, SITES[site]);
      setLists((prev) => ({ ...prev, [site]: fresh }));
      AsyncStorage.setItem('list:' + site, JSON.stringify(fresh));
    } catch (e: any) {
      // 有快取就靜靜失敗、繼續顯示舊清單；冇快取先報錯
      if (!hadCache) setListError(e?.message || '載入失敗');
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
      favoritesRef.current = next;
      scheduleSyncPush();
      return next;
    });
  }

  async function openAnime(a: Anime) {
    setSelected(a);
    // 續看：若有記錄，自動載入上次嗰集並 seek 返
    const prog = progressRef.current[favKey(a)];
    if (prog?.url) {
      resumeAtRef.current = prog.time || 0;
      playEpisode(prog.url, a);
    }
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

  async function playEpisode(url: string, animeOverride?: Anime) {
    const anime = animeOverride ?? selected;
    if (!anime) return;
    setResolving(true);
    setPlayError(null);
    try {
      const info = await parseEpisode(url);
      if (!info.streams.length) throw new Error('找唔到播放器來源');
      const pref = preferredRef.current;
      let idx = pref ? info.streams.findIndex((x) => x.label === pref) : -1;
      if (idx < 0) idx = 0;
      // 喺 replace 之前擷取呢套嘅開頭（readyToPlay 用 startAtRef，唔靠未更新嘅 currentRef）
      startAtRef.current = marksRef.current[favKey(anime)]?.start ?? null;
      const ok = await loadStream(info.streams, idx);
      setCurrent({
        anime,
        episodeUrl: url,
        episodeNo: info.episodeNo,
        streams: info.streams,
        streamIndex: idx,
        prevUrl: info.prevUrl,
        nextUrl: info.nextUrl,
      });
      if (fsOnPlay) setFullscreen(true);
      if (!ok) setPlayError('無法解析此來源，試下切換來源');
      probeAndSort(url, info.streams); // 背景探測速度後重新排序
    } catch (e: any) {
      setPlayError(e?.message || '載入失敗');
    } finally {
      setResolving(false);
    }
  }

  // 背景：對每個來源做輕量 TTFB 探測，由快到慢排序（最快置頂）
  async function probeAndSort(episodeUrl: string, streams: Current['streams']) {
    if (streams.length < 2) return;
    const withTimeout = (p: Promise<any>, ms: number) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), ms))]);
    const timed = await Promise.all(
      streams.map(async (st) => {
        const t0 = Date.now();
        let ms = Infinity;
        try {
          await withTimeout(
            fetch(st.embedUrl, { headers: { 'User-Agent': UA } }),
            6000
          );
          ms = Date.now() - t0;
        } catch {}
        return { ...st, ms };
      })
    );
    timed.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
    setCurrent((c) => {
      if (!c || c.episodeUrl !== episodeUrl) return c;
      const curLabel = c.streams[c.streamIndex]?.label;
      const newIndex = Math.max(0, timed.findIndex((x) => x.label === curLabel));
      return { ...c, streams: timed, streamIndex: newIndex };
    });
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
    seekedRef.current = false; // 新來源 → 容許一次初始 seek
    endFiredRef.current = false; // 新來源 → 重置 End 觸發
    endArmedRef.current = false; // 新來源 → 重新 arm（觀察到 t<end 先生效）
    adRangesRef.current = []; // 新來源 → 清空舊廣告區間
    player.replace(source);
    // 背景偵測廣告（唔阻塞播放）；用同播放一致嘅 headers 避免被 CDN 擋
    if (src!.includes('.m3u8')) {
      getAdRanges(src!, { 'User-Agent': UA, Referer: referer })
        .then((ranges) => {
          adRangesRef.current = ranges;
          if (ranges.length) console.log(`[adskip] 偵測到 ${ranges.length} 段廣告`, ranges);
        })
        .catch(() => {});
    }
    return true;
  }

  async function switchStream(idx: number) {
    const cur = currentRef.current;
    if (!cur) return;
    setResolving(true);
    setPlayError(null);
    // 切來源前記低目前秒數，新來源 ready 後 seek 返
    try {
      resumeAtRef.current = player.currentTime;
    } catch {}
    // 記住用戶揀嘅來源（用 label 配對，下一集沿用）
    const label = cur.streams[idx]?.label ?? null;
    setPreferredLabel(label);
    preferredRef.current = label;
    if (label) AsyncStorage.setItem('srcLabel', label);
    const ok = await loadStream(cur.streams, idx);
    setCurrent((c) => (c ? { ...c, streamIndex: idx } : c));
    if (!ok) setPlayError('此來源無法播放');
    setResolving(false);
  }

  // ===== 側欄清單分組 =====
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 合併揀咗嘅主來源做一個清單（瀏覽 + 搜尋都係）
    const src =
      tab === 'fav'
        ? favorites
        : (Object.keys(SITES) as SiteKey[]).filter((s) => enabledSites[s]).flatMap((s) => lists[s] ?? []);
    // 去重複：同一套（site|slug）只留第一次出現，維持原本次序
    const seen = new Set<string>();
    const deduped = src.filter((a) => {
      const k = favKey(a);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const filtered = deduped.filter((a) => !q || a.search.includes(q) || a.slug.includes(q));
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
  }, [lists, enabledSites, favorites, query, tab]);

  // ===== 焦點輔助（讓遙控器 / 空中滑鼠可操作）=====
  const focusProps = (id: string) => ({
    focusable: true,
    onFocus: () => {
      focusKeyRef.current = id;
      setFocusKey(id);
    },
    onBlur: () => {
      if (focusKeyRef.current === id) focusKeyRef.current = null;
      setFocusKey((k) => (k === id ? null : k));
    },
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

  // 量度內嵌槽位置（相對 root），餵俾 root 層 host 喺非全螢幕時貼合
  const measureSlot = () => {
    const node = playerSlotRef.current;
    const root = rootRef.current;
    if (!node || !root) return;
    node.measureInWindow((sx, sy, sw, sh) => {
      if (!sw && !sh) return;
      root.measureInWindow((rx, ry) => {
        setSlot({ x: sx - rx, y: sy - ry, w: sw, h: sh });
      });
    });
  };
  // 版面改變（轉向 / 側欄開合 / 揀片 / 開始播放）後重新量度
  useEffect(() => {
    const id = setTimeout(measureSlot, 0);
    return () => clearTimeout(id);
  }, [width, height, sidebarOpen, selected, isPlaying, fullscreen]);

  // 全螢幕播放時防止入屏保：hold 住一支獨立於 play/pause 狀態嘅 keep-awake，
  // 咁就算卡 buffer / 跳廣告 / 換集，閒置計時器都唔會彈出屏保（內嵌窗仍靠 expo-video 內建）
  useEffect(() => {
    if (isPlaying && fullscreen) {
      activateKeepAwakeAsync('fs-player');
      return () => {
        deactivateKeepAwake('fs-player');
      };
    }
  }, [isPlaying, fullscreen]);

  // 控制列自動隱藏（同原生控制一齊 show/hide）
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControls = () => {
    setCtrlShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlShown(false), 3500);
  };
  const hideControls = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setCtrlShown(false);
  };
  useEffect(() => {
    if (!isPlaying) return;
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [current?.episodeUrl, fullscreen, isPlaying]);

  // 雲端同步：由雲端拉一次 → 合併落本機（favorites 聯集、progress/marks 較新者勝）
  const pullMerge = async () => {
    const token = syncTokenRef.current;
    if (!token) return;
    try {
      const remote = await syncPull(token);
      const mf = mergeFavorites(favoritesRef.current, remote.favorites || [], favKey);
      const mp = mergeByRecency(progressRef.current, remote.progress || {});
      const mm = mergeByRecency(marksRef.current, remote.marks || {});
      favoritesRef.current = mf;
      setFavorites(mf);
      AsyncStorage.setItem('favorites', JSON.stringify(mf));
      progressRef.current = mp;
      AsyncStorage.setItem('progress', JSON.stringify(mp));
      marksRef.current = mm;
      setMarks(mm);
      AsyncStorage.setItem('marks', JSON.stringify(mm));
    } catch {}
  };

  // 雲端同步：debounce 推上去（登入咗先做）
  const scheduleSyncPush = () => {
    if (!syncTokenRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const token = syncTokenRef.current;
      if (!token) return;
      syncPush(token, {
        favorites: favoritesRef.current,
        progress: progressRef.current,
        marks: marksRef.current,
      }).catch(() => {});
    }, 2500);
  };

  // 登入 / 註冊：攞 token → pull → 合併 → 套用 → push 返
  const doAuth = async (mode: 'login' | 'signup') => {
    const name = syncName.trim();
    if (!name || !syncPass) {
      setSyncErr('請輸入帳號同密碼');
      return;
    }
    setSyncBusy(true);
    setSyncErr(null);
    try {
      const token = mode === 'signup' ? await syncSignup(name, syncPass) : await syncLogin(name, syncPass);
      const remote = await syncPull(token);
      const mergedFav = mergeFavorites(favoritesRef.current, remote.favorites || [], favKey);
      const mergedProg = mergeByRecency(progressRef.current, remote.progress || {});
      const mergedMarks = mergeByRecency(marksRef.current, remote.marks || {});
      // 套用落本機
      favoritesRef.current = mergedFav;
      setFavorites(mergedFav);
      AsyncStorage.setItem('favorites', JSON.stringify(mergedFav));
      progressRef.current = mergedProg;
      AsyncStorage.setItem('progress', JSON.stringify(mergedProg));
      marksRef.current = mergedMarks;
      setMarks(mergedMarks);
      AsyncStorage.setItem('marks', JSON.stringify(mergedMarks));
      // 記住 session
      syncTokenRef.current = token;
      setSyncUser(name);
      AsyncStorage.setItem('syncUser', name);
      AsyncStorage.setItem('syncToken', token);
      // 把合併結果推返雲端
      syncPush(token, { favorites: mergedFav, progress: mergedProg, marks: mergedMarks }).catch(() => {});
      setSyncOpen(false);
      setSyncPass('');
    } catch (e: any) {
      setSyncErr(e?.message || '失敗');
    } finally {
      setSyncBusy(false);
    }
  };
  const doLogout = () => {
    syncTokenRef.current = null;
    setSyncUser(null);
    AsyncStorage.removeItem('syncToken');
    AsyncStorage.removeItem('syncUser');
    setSyncOpen(false);
  };

  // 手動同步：即刻 pull 合併 + push 返（雙向）
  const doSyncNow = async () => {
    const token = syncTokenRef.current;
    if (!token) return;
    setSyncingNow(true);
    try {
      await pullMerge();
      await syncPush(token, {
        favorites: favoritesRef.current,
        progress: progressRef.current,
        marks: marksRef.current,
      });
    } catch {}
    setSyncingNow(false);
  };

  // 自動更新：登入期間每 60 秒 pull 一次，並喺 app 返到前台即刻 pull
  useEffect(() => {
    if (!syncUser) return;
    const id = setInterval(() => {
      pullMerge();
    }, 60000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') pullMerge();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [syncUser]);

  // OTA 更新：production build 啟動時 + 返到前台時，靜靜雞 check + download，有新版先彈提示
  useEffect(() => {
    if (__DEV__) return; // dev 行 Metro，唔好 OTA
    let alive = true;
    const check = async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (alive && fetched.isNew) {
          // 「更新內容」放喺 app.json expo.extra.releaseNotes，會跟新版本個 manifest 派落嚟
          const m: any = (fetched as any).manifest ?? (res as any).manifest;
          const notes = m?.extra?.expoClient?.extra?.releaseNotes;
          setUpdateNotes(typeof notes === 'string' && notes.trim() ? notes.trim() : null);
          setUpdateReady(true);
        }
      } catch {
        // 冇網 / server 錯 → 靜默，唔好阻住用 app
      }
    };
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync(); // 載入啱啱 fetch 落嘅新 bundle，即時生效
    } catch {
      setUpdateReady(false);
    }
  };

  // 逐套 Start/End 標記：寫入 marksRef + state，並即時持久化（唔跟進度 5s throttle）
  const saveMarks = (next: Record<string, { start?: number; end?: number; at?: number }>) => {
    marksRef.current = next;
    setMarks(next);
    AsyncStorage.setItem('marks', JSON.stringify(next));
    scheduleSyncPush();
  };
  const setMarkField = (field: 'start' | 'end') => {
    const c = currentRef.current;
    if (!c) return;
    let tt = NaN;
    try {
      tt = player.currentTime;
    } catch {}
    if (!isFinite(tt)) return;
    const k = favKey(c.anime);
    saveMarks({
      ...marksRef.current,
      [k]: { ...marksRef.current[k], [field]: Math.max(0, Math.floor(tt)), at: Date.now() },
    });
    showControls();
  };
  const clearMarkField = (field: 'start' | 'end') => {
    const c = currentRef.current;
    if (!c) return;
    const k = favKey(c.anime);
    const m = { ...marksRef.current[k], at: Date.now() };
    delete m[field];
    saveMarks({ ...marksRef.current, [k]: m });
    showControls();
  };

  // 返回鍵：選單 / 全螢幕時 → 收起（唔關 app）；否則行預設（離開 app）
  useEffect(() => {
    const onBack = () => {
      if (siteOpenRef.current) {
        setSiteOpen(false);
        return true;
      }
      if (srcOpenRef.current) {
        setSrcOpen(false);
        return true;
      }
      if (fullscreenRef.current) {
        setFullscreen(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  // 遙控器按鍵：來源選單（上/下/OK）優先；其次全螢幕（OK=播放/暫停, 上/下=上/下集, 左/右=倒退/快進）
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('hwKey', (name: string) => {
      // 來源選單開住 → 用遙控器揀來源
      if (srcOpenRef.current) {
        const streams = currentRef.current?.streams ?? [];
        if (name === 'up') setSrcHiBoth(Math.max(0, srcHiRef.current - 1));
        else if (name === 'down') setSrcHiBoth(Math.min(streams.length - 1, srcHiRef.current + 1));
        else if (name === 'ok') {
          switchStream(srcHiRef.current);
          setSrcOpen(false);
        }
        return;
      }
      if (!fullscreenRef.current) return;
      showControls();
      const c = currentRef.current;
      try {
        if (name === 'ok') {
          // 若 focus 喺標記掣 → OK 設／清標記；否則播放/暫停
          const fk = focusKeyRef.current;
          if (fk === 'set-start') setMarkField('start');
          else if (fk === 'set-end') setMarkField('end');
          else if (fk === 'clr-start') clearMarkField('start');
          else if (fk === 'clr-end') clearMarkField('end');
          else if (player.playing) player.pause();
          else player.play();
        } else if (name === 'up') {
          if (c?.prevUrl) playEpisode(c.prevUrl, c.anime);
        } else if (name === 'down') {
          if (c?.nextUrl) playEpisode(c.nextUrl, c.anime);
        } else if (name === 'left') {
          player.currentTime = Math.max(0, player.currentTime - 10);
        } else if (name === 'right') {
          player.currentTime = player.currentTime + 10;
        }
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // 播放器（普通／全螢幕共用同一個 VideoView）
  const playerNode = (
    <>
      <VideoView
        player={player}
        style={s.video}
        nativeControls={false}
        contentFit="contain"
        fullscreenOptions={{ enable: false }}
      />
      {adSkipNote && (
        <View style={s.adSkipNote} pointerEvents="none">
          <Text style={s.adSkipText}>⏭ 已跳過廣告</Text>
        </View>
      )}
      <PlayerOverlay
        player={player}
        current={current}
        ctrlShown={ctrlShown}
        fullscreen={fullscreen}
        showControls={showControls}
        hideControls={hideControls}
        onPrev={() => current?.prevUrl && playEpisode(current.prevUrl)}
        onNext={() => current?.nextUrl && playEpisode(current.nextUrl)}
        onToggleFs={() => setFullscreen((f) => !f)}
        mark={current ? marks[favKey(current.anime)] : undefined}
        onSetStart={() => setMarkField('start')}
        onSetEnd={() => setMarkField('end')}
        onClearStart={() => clearMarkField('start')}
        onClearEnd={() => clearMarkField('end')}
        focusProps={focusProps}
        focused={focused}
      />
    </>
  );

  // ========= 共用片段 =========
  // 切換某主來源開／關（至少保留一個）
  const toggleSite = (k: string) => {
    setEnabledSites((prev) => {
      const on = Object.values(prev).filter(Boolean).length;
      if (prev[k] && on <= 1) return prev; // 唔俾熄淨低最後一個
      const next = { ...prev, [k]: !prev[k] };
      AsyncStorage.setItem('enabledSites', JSON.stringify(next));
      return next;
    });
  };
  const enabledCount = Object.values(enabledSites).filter(Boolean).length;
  const allSites = Object.keys(SITES);
  const siteSummary = enabledCount === allSites.length ? '全部來源' : `${enabledCount} / ${allSites.length} 來源`;

  // [A1] 品牌按鈕：撳開來源篩選；右側標籤顯示已選來源數
  const SiteBox = (
    <Pressable
      {...focusProps('site-cur')}
      style={s.sitePd}
      onPress={() => setSiteOpen((v) => !v)}>
      <View style={[s.spCur, s.spBrand, siteOpen && s.spCurOpen, focused('site-cur')]}>
        <View style={s.spDot} />
        <Text style={s.spName} numberOfLines={1}>
          {siteSummary}
        </Text>
        <Text style={s.spCar}>{siteOpen ? '▴' : '▾'}</Text>
      </View>
    </Pressable>
  );

  const headerBar = (collapse: boolean) => (
    <View style={s.brandRow}>
      <Pressable
        {...focusProps('a1-filter')}
        style={[s.glyph, focused('a1-filter')]}
        onPress={() => setSiteOpen((v) => !v)}>
        <Text style={s.glyphText}>A1</Text>
      </Pressable>
      {SiteBox}
      <Pressable
        {...focusProps('sync')}
        style={[s.cloudBtn, syncUser && s.cloudBtnOn, focused('sync')]}
        onPress={() => {
          setSyncErr(null);
          setSyncOpen(true);
        }}>
        <Text style={[s.cloudText, syncUser && s.cloudTextOn]} numberOfLines={1}>
          {syncUser ? '☁ ' + syncUser : '☁'}
        </Text>
      </Pressable>
      {collapse && (
        <Pressable
          {...focusProps('sb-collapse')}
          hitSlop={6}
          style={[s.collapseBtn, focused('sb-collapse')]}
          onPress={() => setSidebarOpen(false)}>
          <Text style={s.collapseIcon}>«</Text>
        </Pressable>
      )}
    </View>
  );

  const searchBox = (
    <TextInput
      style={s.search}
      placeholder="🔍  搜尋動畫…"
      placeholderTextColor={C.muted}
      value={query}
      onChangeText={setQuery}
    />
  );

  const renderAnimeRow = (item: Anime) => {
    const k = favKey(item);
    const fav = favSet.has(k);
    const active = selected != null && favKey(selected) === k;
    // 顯示來源站台（合併清單會混入兩站，標籤分得清）
    const siteTag = (Object.keys(SITES) as SiteKey[]).find((kk) => SITES[kk] === item.site);
    return (
      <View style={[s.row, active && s.rowActive]}>
        <Pressable
          {...focusProps('row-' + k)}
          style={[s.rowMain, focused('row-' + k) && s.rowFocused]}
          onPress={() => openAnime(item)}>
          <Text style={[s.rowName, active && s.rowNameActive]} numberOfLines={1}>
            {active ? '● ' : ''}
            {item.name}
          </Text>
          <Text style={s.rowMeta} numberOfLines={1}>
            <Text style={s.rowLive}>{item.cntText}</Text> · {item.update}
            {siteTag ? <Text style={s.rowSite}>{'  ·  anime1.' + siteTag}</Text> : null}
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
  };

  const sectionHeader = (title: string, count: number) => (
    <View style={s.yrHeader}>
      <Text style={s.yrLabel}>{title}</Text>
      <View style={s.yrLine} />
      <Text style={s.yrCount}>· {count}</Text>
    </View>
  );

  // 標題列（名 + 集 + 繼續看 + 我的最愛 + 已收藏）
  // 標題跟「正喺睇緊／揀緊」嗰套（selected 優先），切動畫即刻更新
  const titleAnime = selected ?? current?.anime ?? null;
  // 顯示緊嗰套 = 正播緊嗰套 先顯示集數／繼續觀看（免得新名配舊集數）
  const playingThis = !!(current && titleAnime && favKey(current.anime) === favKey(titleAnime));
  const resumeAt = playingThis ? progressRef.current[favKey(titleAnime!)]?.time ?? 0 : 0;
  const titleBar = titleAnime && (
    <View style={s.titleBar}>
      <Text style={s.tbName} numberOfLines={1}>
        {titleAnime.name}
      </Text>
      {playingThis && (
        <View style={s.tbEp}>
          <Text style={s.tbEpText}>第 {current!.episodeNo} 集</Text>
        </View>
      )}
      {playingThis && resumeAt > 1 && (
        <View style={s.tbResume}>
          <Text style={s.tbResumeText}>↺ 繼續觀看 {fmtTime(resumeAt)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      <Pressable
        {...focusProps('fav-filter')}
        style={[s.favFilter, tab === 'fav' && s.favFilterOn, focused('fav-filter')]}
        onPress={() => setTab((t) => (t === 'fav' ? 'all' : 'fav'))}>
        <Text style={[s.favFilterText, tab === 'fav' && s.favFilterTextOn]}>
          ♥ 我的最愛 {favorites.length || ''}
        </Text>
      </Pressable>
      <Pressable
        {...focusProps('now-fav')}
        hitSlop={6}
        style={[s.collectBtn, titleAnime && favSet.has(favKey(titleAnime)) && s.collectBtnOn, focused('now-fav')]}
        onPress={() => titleAnime && toggleFav(titleAnime)}>
        <Text style={[s.collectText, titleAnime && favSet.has(favKey(titleAnime)) && s.collectTextOn]}>
          {titleAnime && favSet.has(favKey(titleAnime)) ? '♥ 已收藏' : '♡ 收藏'}
        </Text>
      </Pressable>
    </View>
  );

  // 集數分段 + 格
  const EP_COLS = isLandscape ? 10 : 5;
  const EP_GAP = 6;
  const epItemW = gridW > 0 ? (gridW - EP_GAP * (EP_COLS - 1)) / EP_COLS : 0;

  const rangeTabs = epBuckets.length > 0 && (
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
  );

  const epGridInner = (
    <View style={s.epWrap} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
      {visibleChapters.map((item) => {
        const on = current?.episodeUrl === item.url;
        return (
          <Pressable
            key={item.url}
            {...focusProps('ep-' + item.url)}
            style={[s.ep, { width: epItemW || undefined }, on && s.epOn, focused('ep-' + item.url)]}
            onPress={() => playEpisode(item.url)}>
            <Text style={[s.epText, on && s.epTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {item.ep}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // 設定（來源 一行）
  const settingsRow = current && (
    <View style={s.settingsRow}>
      {current.streams.length > 0 && (
        <Pressable
          {...focusProps('src-sel')}
          style={[s.srcBar, focused('src-sel')]}
          onPress={() => {
            setSrcHiBoth(current.streamIndex);
            setSrcOpen(true);
          }}>
          <Text style={s.srcBars}>▮▮▮</Text>
          <Text style={s.srcName} numberOfLines={1}>
            {current.streams[current.streamIndex]?.label ?? '—'}
          </Text>
          <Text style={s.srcMs}>
            {(() => {
              const ms = current.streams[current.streamIndex]?.ms;
              return ms == null ? '' : ms === Infinity ? '✕' : ms + 'ms';
            })()}
          </Text>
          <Text style={s.srcOk}>✓</Text>
          <Text style={s.srcCaret}>▾</Text>
        </Pressable>
      )}
      {resolving && <ActivityIndicator color={C.cyan} style={{ marginLeft: 4 }} />}
    </View>
  );

  const railActions = current && (
    <View style={s.railActions}>
      <Pressable
        {...focusProps('fs-onplay')}
        style={[s.toggleRow, focused('fs-onplay')]}
        onPress={() => {
          const v = !fsOnPlay;
          setFsOnPlay(v);
          AsyncStorage.setItem('fsOnPlay', v ? '1' : '0');
        }}>
        <Text style={s.toggleLabel}>播放即全螢幕</Text>
        <View style={[s.switch, fsOnPlay && s.switchOn]}>
          <View style={[s.knob, fsOnPlay && s.knobOn]} />
        </View>
      </Pressable>
      <Pressable
        {...focusProps('fs-enter')}
        style={[s.btnFull, focused('fs-enter')]}
        onPress={() => setFullscreen(true)}>
        <Text style={s.btnFullText}>⛶ 全螢幕播放</Text>
      </Pressable>
    </View>
  );

  // 選集區（標題 + 分段 + 格）
  const pickerHeader = (
    <View style={s.pickerHead}>
      <Text style={s.pickerTitle}>選集</Text>
      <Text style={s.pickerCount}> · 共 {chapters.length} 集</Text>
    </View>
  );

  // 內嵌佔位槽：只負責排版同量度；真正嘅 VideoView 由 root 層 host 浮喺上面
  const playerBlock = (
    <View
      ref={playerSlotRef}
      onLayout={measureSlot}
      style={[s.playerArea, !isLandscape && s.playerAreaPortrait]}>
      {!isPlaying && (
        <View style={s.placeholder}>
          <Text style={s.placeholderText}>{selected ? '揀一集開始播放' : '← 揀一套動畫'}</Text>
        </View>
      )}
    </View>
  );

  // host style：全螢幕用全屏；否則絕對定位貼合量度到嘅內嵌槽
  const hostStyle = fullscreen
    ? s.fsContainer
    : {
        position: 'absolute' as const,
        left: slot.x,
        top: slot.y,
        width: slot.w,
        height: slot.h,
        borderRadius: 18,
        overflow: 'hidden' as const,
        backgroundColor: '#05070f',
      };
  const playerHost = isPlaying ? <View style={hostStyle}>{playerNode}</View> : null;

  // ========= 來源 / 站台 選單覆蓋 =========
  // 來源篩選選單（multi-select：揀用邊幾個主來源，預設全選）
  const siteMenu = siteOpen && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setSiteOpen(false)}>
      <Pressable focusable={false} style={[s.spMenu, isLandscape ? s.spMenuLand : s.spMenuPort]} onPress={() => {}}>
        <Text style={s.srcMenuTitle}>來源（可多選）</Text>
        {allSites.map((k) => {
          const on = !!enabledSites[k];
          return (
            <Pressable
              key={k}
              focusable={false}
              style={[s.spOpt, on && s.spOptOn]}
              onPress={() => toggleSite(k)}>
              <View style={[s.spDot, !on && { backgroundColor: C.mutedDim, shadowOpacity: 0 }]} />
              <Text style={[s.spOptText, on && s.spOptTextOn]}>anime1.{k}</Text>
              <Text style={s.spOptCk}>{on ? '✓' : ''}</Text>
            </Pressable>
          );
        })}
      </Pressable>
    </Pressable>
  );

  const sourceMenu = srcOpen && current && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setSrcOpen(false)}>
      <Pressable focusable={false} style={s.srcMenu} onPress={() => {}}>
        <Text style={s.srcMenuTitle}>選擇來源 · 遙控 ↑↓ OK</Text>
        <ScrollView>
          {current.streams.map((st, i) => {
            const on = i === current.streamIndex;
            const hi = i === srcHi;
            const dead = st.ms === Infinity;
            return (
              <Pressable
                key={i}
                focusable={false}
                style={[s.srcItem, on && s.srcItemOn, hi && s.srcItemHi]}
                onPress={() => {
                  switchStream(i);
                  setSrcOpen(false);
                }}>
                <Text style={s.srcBars}>▮▮▮</Text>
                <Text style={[s.srcItemText, on && s.srcItemTextOn]} numberOfLines={1}>
                  {st.label}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={[s.srcItemMs, dead && { color: C.rose }]}>
                  {st.ms == null ? '…' : dead ? '逾時 ✕' : st.ms + 'ms'}
                </Text>
                {on && <Text style={s.srcItemCk}>✓</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.srcNote}>· 記住此動畫上次來源</Text>
      </Pressable>
    </Pressable>
  );

  // ========= 雲端同步登入 =========
  const syncModal = syncOpen && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setSyncOpen(false)}>
      <Pressable focusable={false} style={s.syncCard} onPress={() => {}}>
        <Text style={s.syncTitle}>☁ 雲端同步</Text>
        <Text style={s.syncSub}>登入後，我的最愛 / 觀看進度 / 開始結束時間 跨裝置同步</Text>
        {syncUser ? (
          <>
            <Text style={s.syncWho}>已登入：{syncUser}</Text>
            <Text style={s.syncSub}>每 60 秒自動同步；亦可手動即刻同步</Text>
            <Pressable
              {...focusProps('sync-now')}
              disabled={syncingNow}
              style={[s.syncBtn, focused('sync-now')]}
              onPress={doSyncNow}>
              <Text style={s.syncBtnText}>{syncingNow ? '同步中…' : '🔄 立即同步'}</Text>
            </Pressable>
            <Pressable
              {...focusProps('sync-logout')}
              style={[s.syncBtnGhost, focused('sync-logout')]}
              onPress={doLogout}>
              <Text style={s.syncBtnGhostText}>登出</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              style={s.syncInput}
              placeholder="帳號"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={syncName}
              onChangeText={setSyncName}
            />
            <TextInput
              style={s.syncInput}
              placeholder="密碼"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={syncPass}
              onChangeText={setSyncPass}
            />
            {syncErr && <Text style={s.syncErr}>{syncErr}</Text>}
            <View style={s.syncRow}>
              <Pressable
                {...focusProps('sync-login')}
                disabled={syncBusy}
                style={[s.syncBtn, { flex: 1 }, focused('sync-login')]}
                onPress={() => doAuth('login')}>
                <Text style={s.syncBtnText}>{syncBusy ? '…' : '登入'}</Text>
              </Pressable>
              <Pressable
                {...focusProps('sync-signup')}
                disabled={syncBusy}
                style={[s.syncBtnGhost, { flex: 1 }, focused('sync-signup')]}
                onPress={() => doAuth('signup')}>
                <Text style={s.syncBtnGhostText}>註冊</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    </Pressable>
  );

  const updateModal = updateReady && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setUpdateReady(false)}>
      <Pressable focusable={false} style={s.syncCard} onPress={() => {}}>
        <Text style={s.syncTitle}>✨ 有新版本</Text>
        <Text style={s.syncSub}>已下載最新版本，立即重新載入即可更新。</Text>
        {updateNotes ? (
          <View style={s.otaNotes}>
            <Text style={s.otaNotesLabel}>更新內容</Text>
            <Text style={s.otaNotesText}>{updateNotes}</Text>
          </View>
        ) : null}
        <Pressable
          {...focusProps('ota-apply')}
          style={[s.syncBtn, focused('ota-apply')]}
          onPress={applyUpdate}>
          <Text style={s.syncBtnText}>立即更新</Text>
        </Pressable>
        <Pressable
          {...focusProps('ota-later')}
          style={[s.syncBtnGhost, focused('ota-later')]}
          onPress={() => setUpdateReady(false)}>
          <Text style={s.syncBtnGhostText}>遲啲</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );

  // ========= LANDSCAPE =========
  if (isLandscape) {
    return (
      <View ref={rootRef} style={s.root}>
        <StatusBar style="light" hidden={fullscreen} />

        {/* 側欄 */}
        {sidebarOpen ? (
          <View style={s.sidebar}>
            <View style={s.sbTop}>
              {headerBar(true)}
              {searchBox}
            </View>
            {loadingList && !sections.length ? (
              <ActivityIndicator color={C.cyan} style={{ marginTop: 24 }} />
            ) : listError && !sections.length ? (
              <Text style={s.err}>❌ {listError}</Text>
            ) : (
              <SectionList
                style={{ flex: 1 }}
                sections={sections}
                keyExtractor={(a) => favKey(a)}
                stickySectionHeadersEnabled
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderSectionHeader={({ section }) => sectionHeader(section.title, section.data.length)}
                renderItem={({ item }) => renderAnimeRow(item)}
                ListEmptyComponent={<Text style={s.empty}>{tab === 'fav' ? '仲未加任何最愛' : '（無符合）'}</Text>}
              />
            )}
          </View>
        ) : (
          <Pressable
            {...focusProps('sb-open')}
            style={[s.railBar, focused('sb-open')]}
            onPress={() => setSidebarOpen(true)}>
            <View style={s.glyphMini}>
              <Text style={s.glyphMiniText}>A1</Text>
            </View>
            <Text style={s.railIcon}>☰</Text>
          </Pressable>
        )}

        {/* 中間：標題 + 播放器 */}
        <View style={s.playerCol}>
          {titleBar}
          {playerBlock}
          {playError && <Text style={s.err}>{playError}</Text>}
        </View>

        {/* 右欄：選集（大）+ 設定（細）+ 動作 */}
        {selected && (
          <View style={s.rightRail}>
            {pickerHeader}
            {rangeTabs}
            {loadingChapters ? (
              <ActivityIndicator color={C.cyan} style={{ marginTop: 16 }} />
            ) : (
              <ScrollView style={s.epScroll} showsVerticalScrollIndicator={false}>
                {epGridInner}
              </ScrollView>
            )}
            {settingsRow}
            {railActions}
          </View>
        )}

        {playerHost}
        {siteMenu}
        {sourceMenu}
        {syncModal}
        {updateModal}
      </View>
    );
  }

  // ========= PORTRAIT =========
  return (
    <View ref={rootRef} style={s.rootPort}>
      <StatusBar style="light" hidden={fullscreen} />
      {!fullscreen && (
        <View style={s.appbar}>
          <Pressable
            {...focusProps('a1-filter')}
            style={[s.glyph, focused('a1-filter')]}
            onPress={() => setSiteOpen((v) => !v)}>
            <Text style={s.glyphText}>A1</Text>
          </Pressable>
          {SiteBox}
          <View style={{ flex: 1 }} />
          <Pressable
            {...focusProps('sync')}
            style={[s.cloudBtn, syncUser && s.cloudBtnOn, focused('sync')]}
            onPress={() => {
              setSyncErr(null);
              setSyncOpen(true);
            }}>
            <Text style={[s.cloudText, syncUser && s.cloudTextOn]} numberOfLines={1}>
              {syncUser ? '☁ ' + syncUser : '☁'}
            </Text>
          </Pressable>
          <Pressable
            {...focusProps('fav-filter')}
            style={[s.favFilter, tab === 'fav' && s.favFilterOn, focused('fav-filter')]}
            onPress={() => setTab((t) => (t === 'fav' ? 'all' : 'fav'))}>
            <Text style={[s.favFilterText, tab === 'fav' && s.favFilterTextOn]}>
              ♥ {favorites.length || ''}
            </Text>
          </Pressable>
        </View>
      )}

      {!fullscreen && playerBlock}
      {!fullscreen && titleBar}
      {playError && !fullscreen && <Text style={s.err}>{playError}</Text>}

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(a) => favKey(a)}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {searchBox}
            {selected && (
              <>
                {settingsRow}
                {pickerHeader}
                {rangeTabs}
                {loadingChapters ? <ActivityIndicator color={C.cyan} style={{ marginVertical: 12 }} /> : epGridInner}
                {railActions}
                <View style={s.divider} />
              </>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => sectionHeader(section.title, section.data.length)}
        renderItem={({ item }) => renderAnimeRow(item)}
        ListEmptyComponent={<Text style={s.empty}>{tab === 'fav' ? '仲未加任何最愛' : '（無符合）'}</Text>}
      />

      {playerHost}
      {siteMenu}
      {sourceMenu}
      {syncModal}
      {updateModal}
    </View>
  );
}

const GLOW = C.rose;

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg, paddingTop: 22 },
  rootPort: { flex: 1, backgroundColor: C.bg, paddingTop: 22 },

  focused: { borderColor: C.cyan, borderWidth: 2 },
  rowFocused: { backgroundColor: 'rgba(52,225,232,0.08)' },

  // ===== Header / brand =====
  glyph: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  glyphMini: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.rose, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  glyphMiniText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  collapseBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseIcon: { color: C.muted, fontSize: 14, fontWeight: '800' },

  // site pulldown
  sitePd: { flex: 1, minWidth: 0 },
  spCur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  spCurOpen: { borderColor: 'rgba(255,77,141,0.5)' },
  spBrand: { borderColor: 'rgba(155,92,255,0.4)' },
  spDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.cyan, shadowColor: C.cyan, shadowRadius: 6, shadowOpacity: 1 },
  spName: { color: C.text, fontSize: 13, fontWeight: '800', flex: 1 },
  spCar: { color: C.muted, fontSize: 11 },
  spMenu: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: 12, padding: 6, width: 220 },
  spMenuLand: { position: 'absolute', top: 64, left: 60 },
  spMenuPort: { position: 'absolute', top: 64, left: 56 },
  spOpt: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8 },
  spOptOn: { backgroundColor: C.rose },
  spOptText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  spOptTextOn: { color: '#fff' },
  spOptCk: { color: '#fff', marginLeft: 'auto', fontSize: 12 },

  // ===== Sidebar =====
  sidebar: { width: 290, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line },
  sbTop: { padding: 14, paddingBottom: 6 },
  search: {
    backgroundColor: C.bg,
    borderColor: C.line2,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: C.text,
    fontSize: 13,
    marginBottom: 8,
  },
  railBar: { width: 44, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.line, alignItems: 'center', paddingTop: 16 },
  railIcon: { color: C.cyan, fontSize: 20, fontWeight: '800' },

  // year header
  yrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 6 },
  yrLabel: { color: C.cyan, fontSize: 12, fontWeight: '800' },
  yrLine: { flex: 1, height: 1, backgroundColor: C.line },
  yrCount: { color: C.mutedDim, fontSize: 11, fontWeight: '700' },

  // anime row (text-only, dense)
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginHorizontal: 6, borderRadius: 10 },
  rowActive: { backgroundColor: 'rgba(52,225,232,0.10)', borderWidth: 1, borderColor: 'rgba(52,225,232,0.25)' },
  rowMain: { flex: 1, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
  rowName: { color: C.text, fontSize: 14, fontWeight: '700' },
  rowNameActive: { color: C.cyan },
  rowMeta: { color: C.muted, fontSize: 11, marginTop: 1 },
  rowSite: { color: C.cyan, fontWeight: '800' },
  rowLive: { color: C.good, fontStyle: 'italic' },
  heart: { paddingHorizontal: 8, paddingVertical: 6 },
  heartIcon: { color: C.mutedDim, fontSize: 16, fontWeight: '700' },
  heartOn: { color: C.rose },
  empty: { color: C.muted, textAlign: 'center', marginTop: 28 },
  err: { color: '#ff7a90', padding: 8, fontSize: 12 },

  // ===== Player column =====
  playerCol: { flex: 1, padding: 12, gap: 8 },
  playerArea: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#05070f' },
  playerAreaPortrait: { flex: 0, aspectRatio: 16 / 9, marginHorizontal: 10, marginTop: 8 },
  video: { flex: 1, backgroundColor: '#000' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0f1c' },
  placeholderText: { color: C.muted, fontSize: 15 },

  // title bar
  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6, flexWrap: 'wrap' },
  tbName: { color: C.text, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  tbEp: { backgroundColor: C.raised, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  tbEpText: { color: C.text, fontSize: 12, fontWeight: '700' },
  tbResume: { borderWidth: 1, borderColor: 'rgba(52,225,232,0.4)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  tbResumeText: { color: C.cyan, fontSize: 12, fontWeight: '700' },
  favFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg,
  },
  favFilterOn: { backgroundColor: 'rgba(255,77,141,0.16)', borderColor: C.rose },
  favFilterText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  favFilterTextOn: { color: C.rose },
  collectBtn: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.raised },
  collectBtnOn: { backgroundColor: C.rose },
  collectText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  collectTextOn: { color: '#fff' },

  // ===== Right rail (episodes) =====
  rightRail: { width: 322, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.line, padding: 14, gap: 10 },
  pickerHead: { flexDirection: 'row', alignItems: 'baseline' },
  pickerTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  pickerCount: { color: C.muted, fontSize: 12, fontWeight: '600' },
  rangeRow: { maxHeight: 36, flexGrow: 0 },
  range: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 6 },
  rangeOn: { backgroundColor: C.rose, borderColor: C.rose },
  rangeText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  rangeTextOn: { color: '#fff' },
  epScroll: { flex: 1 },
  epWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 8 },
  ep: { height: 30, borderRadius: 8, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  epOn: { backgroundColor: C.rose, borderColor: C.rose },
  epText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  epTextOn: { color: '#fff' },

  // settings row (來源)
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  srcBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  srcBars: { color: C.cyan, fontSize: 10, letterSpacing: -1 },
  srcName: { color: C.text, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  srcMs: { color: C.cyan, fontSize: 11, fontWeight: '700' },
  srcOk: { color: C.good, fontSize: 11 },
  srcCaret: { color: C.muted, fontSize: 11, marginLeft: 'auto' },

  railActions: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toggleLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
  switch: { width: 40, height: 22, borderRadius: 11, backgroundColor: C.raised2, padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: C.rose },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: 'flex-start' },
  knobOn: { alignSelf: 'flex-end' },
  btnFull: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: C.rose },
  btnFullText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  divider: { height: 1, backgroundColor: C.line, marginVertical: 10, marginHorizontal: 10 },

  // ===== overlays / menus =====
  overlayBackdrop: {
    position: 'absolute',
    top: -22,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    elevation: 200,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  srcMenu: { width: 248, maxHeight: '70%', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: 13, padding: 8 },
  srcMenuTitle: { color: C.muted, fontSize: 11, fontWeight: '800', marginBottom: 6, paddingHorizontal: 4 },
  srcItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, marginBottom: 4, borderWidth: 2, borderColor: 'transparent' },
  srcItemOn: { backgroundColor: 'rgba(52,225,232,0.10)' },
  srcItemHi: { borderColor: C.cyan },
  srcItemText: { color: C.text, fontSize: 13, fontWeight: '700' },
  srcItemTextOn: { color: C.cyan },
  srcItemMs: { color: C.cyan, fontSize: 11, fontWeight: '800' },
  srcItemCk: { color: C.good, fontSize: 12, marginLeft: 6 },
  srcNote: { color: C.mutedDim, fontSize: 10, marginTop: 6, paddingHorizontal: 4 },

  // ===== 雲端同步 =====
  cloudBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg,
  },
  cloudBtnOn: { borderColor: 'rgba(91,230,168,0.5)', backgroundColor: 'rgba(91,230,168,0.12)' },
  cloudText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  cloudTextOn: { color: C.good },
  syncCard: {
    width: 320,
    maxWidth: '90%',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  syncTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
  syncSub: { color: C.muted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  otaNotes: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line2, borderRadius: 10, padding: 10, gap: 4 },
  otaNotesLabel: { color: C.text, fontSize: 12, fontWeight: '800' },
  otaNotesText: { color: C.muted, fontSize: 13, lineHeight: 19 },
  syncWho: { color: C.good, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  syncInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
  },
  syncErr: { color: '#ff7a90', fontSize: 12 },
  syncRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  syncBtn: { backgroundColor: C.rose, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  syncBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  syncBtnGhost: {
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg,
  },
  syncBtnGhostText: { color: C.text, fontSize: 14, fontWeight: '800' },

  // ===== Portrait =====
  appbar: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8 },

  // ===== PlayerOverlay =====
  tapCatcher: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  ctrCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  ctrBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ctrIcon: { color: '#fff', fontSize: 30, fontWeight: '800' },
  ctrIconSm: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: -6 },
  ctrPlay: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  ctrPlayIcon: { color: C.ink, fontSize: 24, fontWeight: '900' },
  ovBtn: { position: 'absolute', top: '50%', marginTop: -36, width: 46, height: 72, borderRadius: 12, backgroundColor: 'rgba(11,14,26,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  ovLeft: { left: 10 },
  ovRight: { right: 10 },
  ovOff: { opacity: 0.25 },
  ovText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
  fsTopBar: { position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center' },
  fsTopName: { color: '#fff', fontSize: 51, fontWeight: '800', maxWidth: '70%', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  fsTopEp: { color: 'rgba(255,255,255,0.75)', fontSize: 39, fontWeight: '700', marginTop: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  fsToggle: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(11,14,26,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  fsToggleFs: { top: 40, right: 30, backgroundColor: 'rgba(255,77,141,0.92)', borderColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  fsToggleText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  // 開頭／結尾 標記掣（進度條上方，左／右分佈）
  markRow: { position: 'absolute', left: 14, right: 14, bottom: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  markGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markBtn: { backgroundColor: 'rgba(11,14,26,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  markBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  markClear: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,77,141,0.85)', alignItems: 'center', justifyContent: 'center' },
  markClearText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  seekRow: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeText: { color: '#fff', fontSize: 12, fontWeight: '700', minWidth: 92 },
  seekBarWrap: { flex: 1, height: 22, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.32)' },
  seekFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: GLOW },
  seekKnob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', top: 3 },

  adSkipNote: { position: 'absolute', top: 14, alignSelf: 'center', backgroundColor: 'rgba(11,14,26,0.8)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  adSkipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // fullscreen overlay
  fsContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', zIndex: 100, elevation: 100 },
});
