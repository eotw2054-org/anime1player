import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  findNodeHandle,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  SectionList,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer, type VideoSource } from 'expo-video';
import * as Updates from 'expo-updates';
import { K, listKey, getItem, removeItem, setStr, setJSON, setFlag } from './storage/persist';
import { type Anime, SITES, SITE_LABELS, isPlayable } from './lib/anime1';
import { adSkipTarget, type AdRange } from './lib/adskip';
import { getProvider, getProviderBySite } from './lib/sources/registry';
import {
  signup as syncSignup,
  login as syncLogin,
  pull as syncPull,
  push as syncPush,
  mergeFavorites,
  mergeByRecency,
  SYNC_BASE,
} from './lib/sync';
import { C } from './theme';
import { s } from './styles';
import { type SiteKey, type Tab, type Chapter, type Current, type Progress, type Marks } from './lib/types';
import { UA, favKey } from './lib/format';
import { setMark, clearMark } from './lib/marks';
import { buildSections, buildEpBuckets } from './lib/catalog';
import { favMapFromArray, activeFavorites, toggleFavEntry } from './lib/favorites';
import PlayerOverlay from './components/PlayerOverlay';
import EpisodeGrid from './components/EpisodeGrid';
import RemotePanel from './components/RemotePanel';
import TitleBar from './components/TitleBar';
import AnimeRow from './components/AnimeRow';
import { useOtaUpdate } from './hooks/useOtaUpdate';
import { useOrientationLock } from './hooks/useOrientationLock';
import { useKeepAwakeWhile } from './hooks/useKeepAwakeWhile';

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= height;
  // Android edge-to-edge：app 畫面會畫到狀態列底下，要用真實狀態列高度做 paddingTop，
  // 唔可以寫死（之前 22 喺有 notch / 高狀態列嘅機唔夠，頂部按鈕同系統列重疊好難撳）
  const topInset = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 0;

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
  const [autoBest, setAutoBest] = useState(false);
  const autoBestRef = useRef(false);
  useEffect(() => {
    autoBestRef.current = autoBest;
  });
  const [ctrlShown, setCtrlShown] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true); // 打直版控制區手動收合
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
  useOrientationLock(fullscreen);
  const setSrcHiBoth = (i: number) => {
    srcHiRef.current = i;
    setSrcHi(i);
  };
  // A1 設定選單：原生 focus 串連（修 D-pad 落唔到「允許遠端遙控 / 自訂名」）。
  // Android FocusFinder 喺呢個 ScrollView modal 入面落唔到下面，靠明確 nextFocusUp/Down 接駁。
  const a1Refs = useRef<Record<string, any>>({});
  useEffect(() => {
    if (!siteOpen) return;
    const order = [...Object.keys(SITES).map((k) => 'site-' + k), 'allow-remote', 'rc-name'];
    const id = setTimeout(() => {
      order.forEach((key, i) => {
        const node = a1Refs.current[key];
        if (!node?.setNativeProps) return;
        const props: any = {};
        const down = i < order.length - 1 ? findNodeHandle(a1Refs.current[order[i + 1]]) : null;
        const up = i > 0 ? findNodeHandle(a1Refs.current[order[i - 1]]) : null;
        if (down != null) props.nextFocusDown = down;
        if (up != null) props.nextFocusUp = up;
        try {
          node.setNativeProps(props);
        } catch (e) { if (__DEV__) console.warn(e); }
      });
    }, 60);
    return () => clearTimeout(id);
  }, [siteOpen]);

  // 逐套 Start/End 標記（key = site|slug）；marksRef 俾一次性 listener 讀最新值
  const [marks, setMarks] = useState<Marks>({});
  const marksRef = useRef<Marks>({});
  const startAtRef = useRef<number | null>(null); // 今次載入要套用嘅開頭（喺 replace 前擷取）
  const endFiredRef = useRef(false); // 今次載入已觸發 End 跳集
  const endArmedRef = useRef(false); // 觀察到 currentTime < end 後先 arm
  const lastAdvanceRef = useRef(0); // 上次 End 自動跳集時間（wall-clock rate-limit）
  const focusKeyRef = useRef<string | null>(null); // 俾 hwKey 讀目前 focus（遙控設標記）

  // 雲端同步（登入後 favorites/progress/marks 跨裝置）
  const [syncUser, setSyncUser] = useState<string | null>(null);
  const syncTokenRef = useRef<string | null>(null);

  // 遙控（手機 ↔ 投影機，經 SyncHub WebSocket）
  const deviceIdRef = useRef<string>('');
  const [deviceName, setDeviceName] = useState('');
  const [role, setRole] = useState<'player' | 'remote'>('player');
  const roleRef = useRef<'player' | 'remote'>('player');
  const [allowRemote, setAllowRemote] = useState(true); // 預設開（可被遙控）
  const allowRemoteRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<any[]>([]); // roster 入面 role=player
  const [targetId, setTargetId] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<any>(null); // 收到嘅 now-playing（+_recvAt）
  const lastStateSentRef = useRef(0);
  const nameInputRef = useRef<any>(null); // 自定義名稱輸入框（撳 OK 先 focus 開鍵盤）
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false); // ⚙ 設定（自動最佳片源 / 播放即全螢幕）
  const [syncName, setSyncName] = useState('');
  const [syncPass, setSyncPass] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const { updateReady, updateNotes, applyUpdate, dismissUpdate } = useOtaUpdate();
  const favoritesRef = useRef<Anime[]>([]);
  // favAllRef：sync 真身（key → entry {...anime, at, deleted?}），含 tombstone。
  // UI 用嘅 `favorites` state 係由佢 derive 出嚟嘅 active list（過濾 deleted）。
  const favAllRef = useRef<Record<string, any>>({});
  const favAllArray = () => Object.values(favAllRef.current);
  // 套用一份 favAll（array of entries）→ 更新 ref / state / 本機儲存
  const applyFavAll = (arr: any[]) => {
    const map = favMapFromArray(arr);
    favAllRef.current = map;
    const active = activeFavorites(map);
    favoritesRef.current = active;
    setFavorites(active);
    setJSON(K.favAll, Object.values(map));
  };
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
          } catch (e) { if (__DEV__) console.warn(e); }
          resumeAtRef.current = null;
        } else if (startAtRef.current != null && startAtRef.current > 0) {
          // 逐套開頭：跳過片頭（取代舊全域跳秒）
          try {
            player.currentTime = startAtRef.current;
          } catch (e) { if (__DEV__) console.warn(e); }
        }
        startAtRef.current = null;
      }
      player.play();
    }
  });

  // 記錄每套動畫的播放進度（節流存檔）
  useEventListener(player, 'timeUpdate', () => {
    // 遙控器模式唔應該本機播 —— 一 detect 到喺播就即刻停（保險,擋任何 re-play）
    if (roleRef.current === 'remote') {
      try {
        if (player.playing) player.pause();
      } catch (e) { if (__DEV__) console.warn(e); }
      return;
    }
    const c = currentRef.current;
    if (!c) return;
    let t = 0;
    try {
      t = player.currentTime || 0;
    } catch (e) { if (__DEV__) console.warn(e); }
    // 自動跳過廣告：currentTime 落入偵測到嘅廣告區間 → 跳去區間結尾
    if (adRangesRef.current.length) {
      const target = adSkipTarget(t, adRangesRef.current);
      if (target != null) {
        try {
          player.currentTime = target;
        } catch (e) { if (__DEV__) console.warn(e); }
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
        setJSON(K.progress, progressRef.current);
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
      setJSON(K.progress, progressRef.current);
      scheduleSyncPush();
    }
    // 播放器：~3s 心跳廣播 now-playing 俾遙控器
    if (roleRef.current === 'player' && now - lastStateSentRef.current > 3000) broadcastState();
  });

  // 播完自動跳下一集
  useEventListener(player, 'playToEnd', () => {
    const c = currentRef.current;
    if (c?.nextUrl) playEpisode(c.nextUrl, c.anime);
  });

  // 載入設定 + 我的最愛
  useEffect(() => {
    (async () => {
      const [s, mk, fav, favAll, fop, srcl, prog, esites, sUser, sToken, ab, po, dId, dName, dRole, dAllow] =
        await Promise.all([
          getItem(K.site),
          getItem(K.marks),
          getItem(K.favorites),
          getItem(K.favAll),
          getItem(K.fsOnPlay),
          getItem(K.srcLabel),
          getItem(K.progress),
          getItem(K.enabledSites),
          getItem(K.syncUser),
          getItem(K.syncToken),
          getItem(K.autoBest),
          getItem(K.panelOpen),
          getItem(K.deviceId),
          getItem(K.deviceName),
          getItem(K.role),
          getItem(K.allowRemote),
        ]);
      // 裝置身份 + 角色
      let did = dId;
      if (!did) {
        did = 'D' + Math.random().toString(36).slice(2, 8).toUpperCase();
        setStr(K.deviceId, did);
      }
      deviceIdRef.current = did;
      const dn = dName || 'Android-' + did.slice(1, 5);
      setDeviceName(dn.slice(0, 64));
      if (dRole === 'remote' || dRole === 'player') {
        setRole(dRole);
        roleRef.current = dRole;
      }
      const aon = dAllow !== '0'; // 預設開,除非曾經明確關閉
      setAllowRemote(aon);
      allowRemoteRef.current = aon;
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
        } catch (e) { if (__DEV__) console.warn(e); }
      }
      if (esites) {
        try {
          const saved = JSON.parse(esites) as Record<string, boolean>;
          // 以目前 SITES 為準補齊（新增站台預設開）
          setEnabledSites(
            Object.fromEntries(Object.keys(SITES).map((k) => [k, saved[k] ?? true]))
          );
        } catch (e) { if (__DEV__) console.warn(e); }
      }
      if (fop === '1') setFsOnPlay(true);
      if (ab === '1') setAutoBest(true);
      if (po === '0') setPanelOpen(false);
      if (srcl) setPreferredLabel(srcl);
      if (prog) {
        try {
          progressRef.current = JSON.parse(prog);
        } catch (e) { if (__DEV__) console.warn(e); }
      }
      // favAll（新格式,含 tombstone）優先;冇就由舊 'favorites' array migrate(每個補 at）
      try {
        if (favAll) {
          applyFavAll(JSON.parse(favAll));
        } else if (fav) {
          const old = JSON.parse(fav);
          applyFavAll(Array.isArray(old) ? old.map((a: any) => ({ ...a, at: Date.now() })) : []);
        }
      } catch (e) { if (__DEV__) console.warn(e); }
      // 已登入 → 開 app 即刻拉一次雲端最新，merge 落本機
      if (sUser && sToken) {
        try {
          const remote = await syncPull(sToken);
          applyFavAll(mergeFavorites(favAllArray(), remote.favorites || [], favKey));
          const mp = mergeByRecency(progressRef.current, remote.progress || {});
          const mm = mergeByRecency(marksRef.current, remote.marks || {});
          progressRef.current = mp;
          setJSON(K.progress, mp);
          marksRef.current = mm;
          setMarks(mm);
          setJSON(K.marks, mm);
        } catch (e) {
          console.warn('[sync] startup pull failed', e);
        }
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
            const c = await getItem(listKey(s));
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
      const cached = await getItem(listKey(site));
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length) {
          setLists((prev) => ({ ...prev, [site]: arr }));
          hadCache = true;
        }
      }
    } catch (e) { if (__DEV__) console.warn(e); }
    // 冇快取先轉圈；有快取就背景靜靜更新
    if (!hadCache) setLoadingList(true);
    setListError(null);
    try {
      const fresh = await getProviderBySite(SITES[site]).loadCatalog(SITES[site]);
      setLists((prev) => ({ ...prev, [site]: fresh }));
      setJSON(listKey(site), fresh);
    } catch (e: any) {
      // 有快取就靜靜失敗、繼續顯示舊清單；冇快取先報錯
      if (!hadCache) setListError(e?.message || '載入失敗');
    } finally {
      setLoadingList(false);
    }
  }

  function toggleFav(a: Anime) {
    // 切換最愛（軟刪除寫 tombstone，唔淨係 filter 走 —— 咁先傳播到其他裝置 + 防復活）
    const nextMap = toggleFavEntry(favAllRef.current, a, Date.now());
    applyFavAll(Object.values(nextMap)); // 更新 ref/state/儲存（active list 自動過濾 tombstone）
    pushNow();
  }

  async function openAnime(a: Anime) {
    setSelected(a);
    const prog = progressRef.current[favKey(a)];
    // 揀套戲就跟住切換播放（拆走舊有「有紀錄 + 唔係遙控」兩個 gate）。
    // 有紀錄：eager 續看（唔等 chapter fetch）；遙控器叫投影機切。
    if (prog?.url) {
      if (roleRef.current === 'remote') {
        remotePlay(prog.url, a);
      } else {
        resumeAtRef.current = prog.time || 0;
        playEpisode(prog.url, a);
      }
    }
    // 冇紀錄：播 source 俾嘅第一個 url（唔保證係「真‧第 1 集」）。有紀錄已 eager 播咗就唔做。
    const playFirst = (url?: string) => {
      if (!url || prog?.url) return;
      if (roleRef.current === 'remote') {
        remotePlay(url, a);
      } else {
        resumeAtRef.current = null;
        playEpisode(url, a);
      }
    };
    setLoadingChapters(true);
    try {
      const lines = await getProvider(a).getEpisodes(a);
      const chapters = lines[0]?.episodes ?? [{ ep: 1, url: a.latestUrl }];
      setChapters(chapters);
      playFirst(chapters[0]?.url);
    } catch {
      setChapters([{ ep: 1, url: a.latestUrl }]);
      playFirst(a.latestUrl);
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
      const info = await getProvider(anime).getEpisode(url);
      if (!info.streams.length) throw new Error('找唔到播放器來源');
      // 切換「影片」（換咗一套）先做最佳片源探測；同一套換 chapter 唔再 detect（基本上唔會轉）
      const prevAnime = currentRef.current?.anime;
      const isNewAnime = !prevAnime || favKey(prevAnime) !== favKey(anime);
      let streams = info.streams;
      let idx: number;
      let probed = false;
      if (autoBestRef.current && isNewAnime && streams.length >= 2) {
        // 切換影片：先探測揀最快，至開始播（會等多幾秒，值得）
        streams = await probeStreams(streams);
        idx = 0;
        probed = true;
        preferredRef.current = streams[0].label; // 同套之後嘅 chapter 沿用呢個來源
      } else {
        const pref = preferredRef.current;
        idx = pref ? streams.findIndex((x) => x.label === pref) : -1;
        if (idx < 0) idx = 0;
      }
      // 喺 replace 之前擷取呢套嘅開頭（readyToPlay 用 startAtRef，唔靠未更新嘅 currentRef）
      startAtRef.current = marksRef.current[favKey(anime)]?.start ?? null;
      const ok = await loadStream(streams, idx, anime);
      setCurrent({
        anime,
        episodeUrl: url,
        episodeNo: info.episodeNo,
        streams,
        streamIndex: idx,
        prevUrl: info.prevUrl,
        nextUrl: info.nextUrl,
      });
      if (fsOnPlay) setFullscreen(true);
      if (!ok) setPlayError('無法解析此來源，試下切換來源');
      // 未探測過先背景探測排序（顯示 ms）；自動最佳已經喺上面探測過,唔使再做
      if (!probed) probeAndSort(url, streams);
    } catch (e: any) {
      setPlayError(e?.message || '載入失敗');
    } finally {
      setResolving(false);
    }
  }

  // 對每個來源做輕量 TTFB 探測，回傳由快到慢排序嘅清單（最快置頂，逾時 = Infinity）
  async function probeStreams(streams: Current['streams']): Promise<Current['streams']> {
    const withTimeout = (p: Promise<any>, ms: number) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), ms))]);
    const timed = await Promise.all(
      streams.map(async (st) => {
        const t0 = Date.now();
        let ms = Infinity;
        try {
          await withTimeout(fetch(st.embedUrl, { headers: { 'User-Agent': UA } }), 6000);
          ms = Date.now() - t0;
        } catch (e) { if (__DEV__) console.warn(e); }
        return { ...st, ms };
      })
    );
    timed.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
    return timed;
  }

  // 背景：探測後重新排序（最快置頂），唔切換正喺播緊嘅來源
  async function probeAndSort(episodeUrl: string, streams: Current['streams']) {
    if (streams.length < 2) return;
    const timed = await probeStreams(streams);
    setCurrent((c) => {
      if (!c || c.episodeUrl !== episodeUrl) return c;
      const curLabel = c.streams[c.streamIndex]?.label;
      const newIndex = Math.max(0, timed.findIndex((x) => x.label === curLabel));
      return { ...c, streams: timed, streamIndex: newIndex };
    });
  }

  // 即時：探測目前集數所有來源，切去最快嗰個（揀「自動選擇最佳片源」開關時用）
  async function applyBestSource() {
    const c = currentRef.current;
    if (!c || c.streams.length < 2) return;
    setResolving(true);
    try {
      const timed = await probeStreams(c.streams);
      const curLabel = c.streams[c.streamIndex]?.label;
      const best = timed[0];
      if (best && best.ms !== Infinity && best.label !== curLabel) {
        try {
          resumeAtRef.current = player.currentTime;
        } catch (e) { if (__DEV__) console.warn(e); }
        const ok = await loadStream(timed, 0, c.anime);
        preferredRef.current = best.label; // 同套之後嘅 chapter 沿用
        if (!ok) setPlayError('最佳來源無法播放，試下手動切換');
      }
      setCurrent((x) => {
        if (!x || x.episodeUrl !== c.episodeUrl) return x;
        const newIndex = Math.max(0, timed.findIndex((t) => t.label === preferredRef.current));
        return { ...x, streams: timed, streamIndex: newIndex };
      });
    } finally {
      setResolving(false);
    }
  }

  async function loadStream(streams: Current['streams'], idx: number, anime: Anime): Promise<boolean> {
    const provider = getProvider(anime);
    const resolved = await provider.resolveStream(streams[idx].embedUrl);
    const src = typeof resolved === 'string' ? resolved : resolved?.url ?? null;
    // provider 可附帶播放 headers（例 anime1.me 嘅 CDN Cookie，唔加 mp4 會 403）
    const extraHeaders = resolved && typeof resolved !== 'string' ? resolved.headers ?? {} : {};
    if (!isPlayable(src)) return false;
    let referer = '';
    try {
      referer = new URL(streams[idx].embedUrl).origin + '/';
    } catch (e) { if (__DEV__) console.warn(e); }
    const headers = { 'User-Agent': UA, Referer: referer, ...extraHeaders };
    const source: VideoSource = {
      uri: src!,
      contentType: src!.includes('.m3u8') ? 'hls' : 'auto',
      headers,
    };
    seekedRef.current = false; // 新來源 → 容許一次初始 seek
    endFiredRef.current = false; // 新來源 → 重置 End 觸發
    endArmedRef.current = false; // 新來源 → 重新 arm（觀察到 t<end 先生效）
    adRangesRef.current = []; // 新來源 → 清空舊廣告區間
    player.replace(source);
    // 背景偵測廣告（唔阻塞播放）；用同播放一致嘅 headers 避免被 CDN 擋
    if (src!.includes('.m3u8')) {
      // 廣告偵測係 provider 嘅 optional capability：冇實作就唔跳（唔會誤跳真內容）
      (provider.adDetector
        ? provider.adDetector(src!, headers)
        : Promise.resolve([])
      )
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
    } catch (e) { if (__DEV__) console.warn(e); }
    // 記住用戶揀嘅來源（用 label 配對，下一集沿用）
    const label = cur.streams[idx]?.label ?? null;
    setPreferredLabel(label);
    preferredRef.current = label;
    if (label) setStr(K.srcLabel, label);
    const ok = await loadStream(cur.streams, idx, cur.anime);
    setCurrent((c) => (c ? { ...c, streamIndex: idx } : c));
    if (!ok) setPlayError('此來源無法播放');
    setResolving(false);
  }

  // ===== 側欄清單分組 =====
  const sections = useMemo(
    () => buildSections(lists, enabledSites, favorites, query, tab),
    [lists, enabledSites, favorites, query, tab],
  );

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
  const epBuckets = useMemo(() => buildEpBuckets(chapters, EP_BUCKET), [chapters]);

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

  // 全螢幕播放時防止入屏保（獨立於 play/pause，卡 buffer / 跳廣告 / 換集 都唔彈屏保）
  useKeepAwakeWhile(!!(isPlaying && fullscreen));

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
      applyFavAll(mergeFavorites(favAllArray(), remote.favorites || [], favKey));
      const mp = mergeByRecency(progressRef.current, remote.progress || {});
      const mm = mergeByRecency(marksRef.current, remote.marks || {});
      progressRef.current = mp;
      setJSON(K.progress, mp);
      marksRef.current = mm;
      setMarks(mm);
      setJSON(K.marks, mm);
    } catch (e) {
      console.warn('[sync] pull failed', e);
    }
  };

  // 雲端同步：即時推上去（清走未發嘅 debounce）—— 用喺離散、重要嘅改動（最愛、開始/結束）
  const pushNow = () => {
    if (pushTimer.current) {
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
    }
    const token = syncTokenRef.current;
    if (!token) return;
    syncPush(token, {
      favorites: favAllArray(),
      progress: progressRef.current,
      marks: marksRef.current,
    }).catch((e) => console.warn('[sync] push failed', e));
  };
  // 雲端同步：debounce 推上去（登入咗先做）—— 用喺頻繁嘅改動（播放進度）
  const scheduleSyncPush = () => {
    if (!syncTokenRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(pushNow, 2500);
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
      applyFavAll(mergeFavorites(favAllArray(), remote.favorites || [], favKey));
      const mergedProg = mergeByRecency(progressRef.current, remote.progress || {});
      const mergedMarks = mergeByRecency(marksRef.current, remote.marks || {});
      progressRef.current = mergedProg;
      setJSON(K.progress, mergedProg);
      marksRef.current = mergedMarks;
      setMarks(mergedMarks);
      setJSON(K.marks, mergedMarks);
      // 記住 session
      syncTokenRef.current = token;
      setSyncUser(name);
      setStr(K.syncUser, name);
      setStr(K.syncToken, token);
      // 把合併結果推返雲端
      syncPush(token, { favorites: favAllArray(), progress: mergedProg, marks: mergedMarks }).catch((e) => console.warn('[sync] push failed', e));
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
    removeItem(K.syncToken);
    removeItem(K.syncUser);
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
        favorites: favAllArray(),
        progress: progressRef.current,
        marks: marksRef.current,
      });
    } catch (e) {
      console.warn('[sync] manual sync failed', e);
    }
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
      else if (st === 'background' || st === 'inactive') pushNow(); // 退背景前 flush 未發嘅進度
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [syncUser]);

  // ===== 遙控 helpers =====
  const wsSend = (obj: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ ...obj, from: deviceIdRef.current }));
      } catch (e) { if (__DEV__) console.warn(e); }
    }
  };
  const sendHello = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      // 播放器但未開「允許遠端遙控」→ 報 player_locked,唔會出現喺遙控器嘅播放器清單
      const annRole =
        roleRef.current === 'player' && !allowRemoteRef.current ? 'player_locked' : roleRef.current;
      try {
        ws.send(JSON.stringify({ type: 'hello', deviceId: deviceIdRef.current, name: deviceName, role: annRole }));
      } catch (e) { if (__DEV__) console.warn(e); }
    }
  };
  // 播放器：broadcast now-playing 俾遙控器
  const broadcastState = () => {
    if (roleRef.current !== 'player' || !allowRemoteRef.current) return;
    const c = currentRef.current;
    if (!c) return;
    let position = 0,
      duration = 0,
      playing = false;
    try {
      position = player.currentTime || 0;
      duration = player.duration || 0;
      playing = player.playing;
    } catch (e) { if (__DEV__) console.warn(e); }
    lastStateSentRef.current = Date.now();
    wsSend({
      type: 'state',
      title: c.anime?.name,
      ep: c.episodeNo,
      position,
      duration,
      playing,
      hasPrev: !!c.prevUrl,
      hasNext: !!c.nextUrl,
      at: Date.now(),
    });
  };
  // 播放器：執行遙控器嘅 cmd（只 player 角色、targetId 啱、唔係自己發）
  const execCmd = (m: any) => {
    if (roleRef.current !== 'player' || !allowRemoteRef.current) return; // 未開允許遙控 → 唔執行
    if (m.targetId && m.targetId !== deviceIdRef.current) return;
    const c = currentRef.current;
    try {
      switch (m.action) {
        case 'toggle':
          player.playing ? player.pause() : player.play();
          break;
        case 'next':
          if (c?.nextUrl) playEpisode(c.nextUrl, c.anime);
          break;
        case 'prev':
          if (c?.prevUrl) playEpisode(c.prevUrl, c.anime);
          break;
        case 'seek':
          player.currentTime = Math.max(0, (player.currentTime || 0) + (m.value || 0));
          break;
        case 'seekTo':
          player.currentTime = (m.value || 0) * (player.duration || 0);
          break;
        case 'fs':
          setFullscreen(m.value !== false);
          break;
        case 'setStart':
          setMarkField('start');
          break;
        case 'setEnd':
          setMarkField('end');
          break;
        case 'clearStart':
          clearMarkField('start');
          break;
        case 'clearEnd':
          clearMarkField('end');
          break;
        case 'playEpisode':
          if (m.value?.url) {
            playEpisode(m.value.url, m.value.anime);
            setFullscreen(true);
          }
          break;
      }
    } catch (e) { if (__DEV__) console.warn(e); }
    setTimeout(broadcastState, 300); // 執行後即刻回報新狀態
  };
  // 遙控器：揀片 → 叫投影機播（唔喺手機播）
  const remotePlay = (url: string, anime: Anime) => {
    if (remoteLockedRef.current) return; // 遙控鎖定中：唔送（防誤觸）
    // 讀 targetIdRef.current（唔讀 closure targetId）；未鎖定 target 就 no-op，
    // 否則 null targetId 會被所有 player 一齊執行。
    const tid = targetIdRef.current;
    if (tid == null) return;
    wsSend({ type: 'cmd', targetId: tid, action: 'playEpisode', value: { url, anime } });
  };

  // roleRef / allowRemoteRef 同步 + 變更即時 re-send hello（唔 reconnect）
  useEffect(() => {
    roleRef.current = role;
    allowRemoteRef.current = allowRemote;
    sendHello();
    if (role === 'remote') {
      try {
        player.pause();
      } catch (e) { if (__DEV__) console.warn(e); }
    }
  }, [role, deviceName, allowRemote]);

  // 遙控器：每 0.5s tick 推算進度條
  const [remoteTick, setRemoteTick] = useState(0);
  const targetIdRef = useRef<string | null>(null);
  useEffect(() => {
    targetIdRef.current = targetId;
  }, [targetId]);
  useEffect(() => {
    if (role !== 'remote') return;
    const id = setInterval(() => setRemoteTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [role]);

  // 即時同步：登入期間開一條 WebSocket 去 sync hub（DO）。
  // 對方裝置改動 → server broadcast「changed」→ 即刻 pullMerge（sub-second）。60s poll 做 fallback。
  useEffect(() => {
    if (!syncUser) return;
    let alive = true;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const token = syncTokenRef.current;
      if (!alive || !token) return;
      try {
        ws = new WebSocket(SYNC_BASE.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token));
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => sendHello();
      ws.onmessage = (e: any) => {
        let m: any;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (!m || typeof m !== 'object') return;
        if (m.from && m.from === deviceIdRef.current) return; // 忽略自己（保險）
        switch (m.type) {
          case 'changed':
            pullMerge();
            break;
          case 'roster': {
            const players = (m.devices || []).filter((d: any) => d.role === 'player');
            setRemotePlayers(players);
            setTargetId((cur) => {
              if (players.length === 0) return null;
              if (cur && players.some((p: any) => p.deviceId === cur)) return cur;
              return players.length === 1 ? players[0].deviceId : cur;
            });
            break;
          }
          case 'state':
            setRemoteState({ ...m, _recvAt: Date.now() });
            break;
          case 'cmd':
            execCmd(m);
            break;
        }
      };
      ws.onclose = scheduleRetry;
      ws.onerror = () => {
        try {
          ws?.close();
        } catch (e) { if (__DEV__) console.warn(e); }
      };
    };
    const scheduleRetry = () => {
      if (!alive || retry) return;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, 5000);
    };
    connect();
    // app 返前台時,若 socket 斷咗就即刻重連 + pull 一次補返
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && alive && (!ws || ws.readyState > 1)) {
        if (retry) {
          clearTimeout(retry);
          retry = null;
        }
        connect();
      }
    });
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      sub.remove();
      try {
        ws?.close();
      } catch (e) { if (__DEV__) console.warn(e); }
      wsRef.current = null;
    };
  }, [syncUser]);

  // 逐套 Start/End 標記：寫入 marksRef + state，並即時持久化（唔跟進度 5s throttle）
  const saveMarks = (next: Marks) => {
    marksRef.current = next;
    setMarks(next);
    setJSON(K.marks, next);
    pushNow();
  };
  const setMarkField = (field: 'start' | 'end') => {
    const c = currentRef.current;
    if (!c) return;
    let tt = NaN;
    try {
      tt = player.currentTime;
    } catch (e) { if (__DEV__) console.warn(e); }
    if (!isFinite(tt)) return;
    saveMarks(setMark(marksRef.current, favKey(c.anime), field, tt, Date.now()));
    showControls();
  };
  const clearMarkField = (field: 'start' | 'end') => {
    const c = currentRef.current;
    if (!c) return;
    saveMarks(clearMark(marksRef.current, favKey(c.anime), field, Date.now()));
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
      } catch (e) { if (__DEV__) console.warn(e); }
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
      setJSON(K.enabledSites, next);
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
    return (
      <AnimeRow
        item={item}
        fav={favSet.has(k)}
        active={selected != null && favKey(selected) === k}
        onOpen={() => openAnime(item)}
        onToggleFav={() => toggleFav(item)}
        focusProps={focusProps}
        focused={focused}
      />
    );
  };

  const sectionHeader = (title: string, count: number) => (
    <View style={s.yrHeader}>
      <Text style={s.yrLabel}>{title}</Text>
      <View style={s.yrLine} />
      <Text style={s.yrCount}>· {count}</Text>
    </View>
  );

  // 我的最愛篩選掣（打橫放標題列，打直放搜尋行）
  const favFilterBtn = (
    <Pressable
      {...focusProps('fav-filter')}
      style={[s.favFilter, tab === 'fav' && s.favFilterOn, focused('fav-filter')]}
      onPress={() => setTab((t) => (t === 'fav' ? 'all' : 'fav'))}>
      <Text style={[s.favFilterText, tab === 'fav' && s.favFilterTextOn]}>
        ♥ 我的最愛 {favorites.length || ''}
      </Text>
    </Pressable>
  );

  // 標題列（名 + 集 + 收起控制 + 我的最愛(打橫)）
  // 標題跟「正喺睇緊／揀緊」嗰套（selected 優先），切動畫即刻更新
  const titleAnime = selected ?? current?.anime ?? null;
  // 顯示緊嗰套 = 正播緊嗰套 先顯示集數／繼續觀看（免得新名配舊集數）
  // 角色 toggle（播放器/遙控器）
  const setRoleP = (r: 'player' | 'remote') => {
    setRole(r);
    roleRef.current = r;
    setStr(K.role, r);
    if (r === 'remote') {
      setFullscreen(false);
      try {
        player.pause(); // 遙控器唔本機播,收聲
      } catch (e) { if (__DEV__) console.warn(e); }
    }
  };
  const roleToggle = (
    <View style={s.roleSeg}>
      <Pressable
        {...focusProps('role-player')}
        style={[s.roleSegBtn, role === 'player' && s.roleSegOn, focused('role-player')]}
        onPress={() => setRoleP('player')}>
        <Text style={[s.roleSegText, role === 'player' && s.roleSegTextOn]}>播放器</Text>
      </Pressable>
      <Pressable
        {...focusProps('role-remote')}
        style={[s.roleSegBtn, role === 'remote' && s.roleSegOn, focused('role-remote')]}
        onPress={() => setRoleP('remote')}>
        <Text style={[s.roleSegText, role === 'remote' && s.roleSegTextOn]}>遙控器</Text>
      </Pressable>
    </View>
  );

  const playingThis = !!(current && titleAnime && favKey(current.anime) === favKey(titleAnime));
  const titleBar = titleAnime && (
    <TitleBar
      name={titleAnime.name}
      playingEp={playingThis ? current!.episodeNo : null}
      roleToggle={roleToggle}
      showPanelToggle={!isLandscape && !!selected}
      panelOpen={panelOpen}
      onTogglePanel={() => {
        const v = !panelOpen;
        setPanelOpen(v);
        setFlag(K.panelOpen, v);
      }}
      favFilter={isLandscape ? favFilterBtn : null}
      focusProps={focusProps}
      focused={focused}
    />
  );

  // 打直版：搜尋 + 收藏（收藏目前揀緊嗰套）同一行
  const collectBtn = titleAnime && (
    <Pressable
      {...focusProps('now-fav')}
      hitSlop={6}
      style={[s.collectBtn, favSet.has(favKey(titleAnime)) && s.collectBtnOn, focused('now-fav')]}
      onPress={() => toggleFav(titleAnime)}>
      <Text style={[s.collectText, favSet.has(favKey(titleAnime)) && s.collectTextOn]}>
        {favSet.has(favKey(titleAnime)) ? '♥ 已收藏' : '♡ 收藏'}
      </Text>
    </Pressable>
  );
  const searchFavRow = (
    <View style={s.searchFavRow}>
      <TextInput
        style={[s.search, s.searchFlex]}
        placeholder="🔍  搜尋動畫…"
        placeholderTextColor={C.muted}
        value={query}
        onChangeText={setQuery}
      />
      {collectBtn}
      {favFilterBtn}
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
    <EpisodeGrid
      chapters={visibleChapters}
      currentUrl={current?.episodeUrl}
      itemWidth={epItemW}
      onLayout={setGridW}
      onPlay={(url) => (role === 'remote' && selected ? remotePlay(url, selected) : playEpisode(url))}
      focusProps={focusProps}
      focused={focused}
    />
  );

  // 打直版：集格最多 3 行，多過就喺格仔區內部捲（唔撐長成個 page）
  const epGridPort = (
    <ScrollView style={s.epScrollPort} nestedScrollEnabled showsVerticalScrollIndicator>
      {epGridInner}
    </ScrollView>
  );

  // ===== 可組合嘅控制零件（打橫上下排，打直就兩兩並排）=====
  const srcSelectorBtn = current && current.streams.length > 0 && (
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
  );

  const autoBestToggle = (
    <Pressable
      {...focusProps('auto-best')}
      style={[s.toggleRow, focused('auto-best')]}
      onPress={() => {
        const v = !autoBest;
        setAutoBest(v);
        autoBestRef.current = v;
        setFlag(K.autoBest, v);
        // 即開即生效：若有播緊嘅集，立即探測 + 切去最快來源
        if (v) applyBestSource();
      }}>
      <Text style={s.toggleLabel}>自動最佳片源</Text>
      <View style={[s.switch, autoBest && s.switchOn]}>
        <View style={[s.knob, autoBest && s.knobOn]} />
      </View>
    </Pressable>
  );

  const fsOnPlayToggle = (
    <Pressable
      {...focusProps('fs-onplay')}
      style={[s.toggleRow, focused('fs-onplay')]}
      onPress={() => {
        const v = !fsOnPlay;
        setFsOnPlay(v);
        setFlag(K.fsOnPlay, v);
      }}>
      <Text style={s.toggleLabel}>播放即全螢幕</Text>
      <View style={[s.switch, fsOnPlay && s.switchOn]}>
        <View style={[s.knob, fsOnPlay && s.knobOn]} />
      </View>
    </Pressable>
  );

  const fsEnterBtn = (extra?: object) => (
    <Pressable
      {...focusProps('fs-enter')}
      style={[s.btnFull, extra, focused('fs-enter')]}
      onPress={() => setFullscreen(true)}>
      <Text style={s.btnFullText}>⛶ 全螢幕播放</Text>
    </Pressable>
  );

  // 打橫版：來源一行 + 動作上下排（右欄窄）
  const settingsRow = current && (
    <View style={s.settingsRow}>
      {srcSelectorBtn}
      {resolving && <ActivityIndicator color={C.cyan} style={{ marginLeft: 4 }} />}
    </View>
  );

  const railActions = current && (
    <View style={s.railActions}>
      {fsOnPlayToggle}
      {autoBestToggle}
      {fsEnterBtn()}
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

  // 遙控器「鎖定」：開咗 lock 就唔送任何 cmd 俾播放器（即暫時斷控制，防誤觸）
  const [remoteLocked, setRemoteLocked] = useState(false);
  const remoteLockedRef = useRef(false);
  const toggleRemoteLock = () => {
    setRemoteLocked((v) => {
      remoteLockedRef.current = !v;
      return !v;
    });
  };

  // 遙控器進度條（拖放 → seekTo）
  const rsBarWRef = useRef(0);
  const rsBarXRef = useRef(0);
  const [rsDrag, setRsDrag] = useState<number | null>(null);
  const rsDragRef = useRef<number | null>(null);
  const rsPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !remoteLockedRef.current,
      onMoveShouldSetPanResponder: () => !remoteLockedRef.current,
      onPanResponderGrant: (e) => {
        const w = rsBarWRef.current;
        rsBarXRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const x = Math.min(w, Math.max(0, e.nativeEvent.locationX));
        rsDragRef.current = x;
        setRsDrag(x);
      },
      onPanResponderMove: (e, gs) => {
        const w = rsBarWRef.current;
        const x = Math.min(w, Math.max(0, gs.moveX - rsBarXRef.current));
        rsDragRef.current = x;
        setRsDrag(x);
      },
      onPanResponderRelease: () => {
        const w = rsBarWRef.current;
        const x = rsDragRef.current ?? 0;
        const ratio = w > 0 ? Math.min(1, Math.max(0, x / w)) : 0;
        wsSend({ type: 'cmd', targetId: targetIdRef.current, action: 'seekTo', value: ratio });
        rsDragRef.current = null;
        setRsDrag(null);
      },
    })
  ).current;

  const rcmd = (action: string, value?: any) => {
    if (remoteLockedRef.current) return; // 鎖定中：唔送 cmd（防誤觸）
    wsSend({ type: 'cmd', targetId: targetIdRef.current, action, value });
  };
  const remotePanel = (
    <RemotePanel
      remoteState={remoteState}
      remotePlayers={remotePlayers}
      targetId={targetId}
      setTargetId={setTargetId}
      syncUser={syncUser}
      titleAnime={titleAnime}
      roleToggle={roleToggle}
      onRescan={sendHello}
      remoteLocked={remoteLocked}
      onToggleLock={toggleRemoteLock}
      rsDrag={rsDrag}
      rsBarWRef={rsBarWRef}
      rsPanHandlers={rsPan.panHandlers}
      rcmd={rcmd}
      focusProps={focusProps}
      focused={focused}
      tick={remoteTick}
    />
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
  // 遙控器模式：唔 render 本機 video（佢只係遙控,唔播片）
  const playerHost = role === 'remote' ? null : isPlaying ? <View style={hostStyle}>{playerNode}</View> : null;

  // ========= 來源 / 站台 選單覆蓋 =========
  // 版本 / OTA 資訊（撳 [A1] 開來源選單時喺底部顯示）
  const otaInfo = (() => {
    try {
      const rv = Updates.runtimeVersion ?? '?';
      const ch = Updates.channel ?? 'dev';
      if (Updates.isEmbeddedLaunch) return `v${rv} · ${ch} · 內建版本（未 OTA）`;
      const id = (Updates.updateId ?? '').slice(0, 8);
      const dt = Updates.createdAt ? new Date(Updates.createdAt).toLocaleString() : '';
      return `v${rv} · ${ch} · OTA ${id}${dt ? ' · ' + dt : ''}`;
    } catch {
      return `v${'1.0.0'} · dev`;
    }
  })();

  // 設定選單（撳 A1）：影片來源（可多選）+ 關於（版本）
  const siteMenu = siteOpen && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setSiteOpen(false)}>
      <Pressable focusable={false} style={[s.spMenu, isLandscape ? s.spMenuLand : s.spMenuPort]} onPress={() => {}}>
        <ScrollView showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <Text style={s.srcMenuTitle}>設定</Text>
        <Text style={s.spSection}>影片來源（可多選）</Text>
        {allSites.map((k, i) => {
          const on = !!enabledSites[k];
          return (
            <Pressable
              key={k}
              ref={(r) => {
                a1Refs.current['site-' + k] = r;
              }}
              {...focusProps('site-' + k)}
              hasTVPreferredFocus={i === 0}
              style={[s.spOpt, on && s.spOptOn, focused('site-' + k)]}
              onPress={() => toggleSite(k)}>
              <View style={[s.spDot, !on && { backgroundColor: C.mutedDim, shadowOpacity: 0 }]} />
              <Text style={[s.spOptText, on && s.spOptTextOn]}>{SITE_LABELS[k] ?? 'anime1.' + k}</Text>
              <Text style={s.spOptCk}>{on ? '✓' : ''}</Text>
            </Pressable>
          );
        })}
        <Text style={s.spSection}>遙控</Text>
        <Pressable
          ref={(r) => {
            a1Refs.current['allow-remote'] = r;
          }}
          {...focusProps('allow-remote')}
          style={[s.spOpt, allowRemote && s.spOptOn, focused('allow-remote')]}
          onPress={() => {
            const v = !allowRemote;
            setAllowRemote(v);
            allowRemoteRef.current = v;
            setFlag(K.allowRemote, v);
          }}>
          <View style={[s.spDot, !allowRemote && { backgroundColor: C.mutedDim, shadowOpacity: 0 }]} />
          <Text style={[s.spOptText, allowRemote && s.spOptTextOn]}>允許遠端遙控（被其他裝置控制）</Text>
          <Text style={s.spOptCk}>{allowRemote ? '✓' : ''}</Text>
        </Pressable>
        {/* D-pad 目標:撳 OK → focus 輸入框,彈系統鍵盤;TextInput 本身 focusable=false 免重複搶焦 */}
        <Pressable
          ref={(r) => {
            a1Refs.current['rc-name'] = r;
          }}
          {...focusProps('rc-name')}
          style={[s.spNameField, focused('rc-name')]}
          onPress={() => nameInputRef.current?.focus()}>
          <TextInput
            ref={nameInputRef}
            focusable={false}
            style={s.spNameInput}
            value={deviceName}
            onChangeText={(t) => {
              const v = t.slice(0, 64);
              setDeviceName(v);
              setStr(K.deviceName, v);
            }}
            placeholder="自定義名稱（撳 OK 打字）"
            placeholderTextColor={C.muted}
            maxLength={64}
          />
        </Pressable>
        <Text style={s.spSection}>關於</Text>
        <Text style={s.spVer} selectable>{otaInfo}</Text>
        </ScrollView>
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
            const dead = st.ms === Infinity;
            return (
              <Pressable
                key={i}
                {...focusProps('src-' + i)}
                hasTVPreferredFocus={i === current.streamIndex}
                style={[s.srcItem, on && s.srcItemOn, focused('src-' + i)]}
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
            {/* 登出放右上角細掣,免撳錯 */}
            <Pressable
              {...focusProps('sync-logout')}
              style={[s.syncLogout, focused('sync-logout')]}
              onPress={doLogout}>
              <Text style={s.syncLogoutText}>登出</Text>
            </Pressable>
            <Text style={s.syncWho}>已登入：{syncUser}</Text>
            <Text style={s.syncSub}>改動即時同步（WebSocket）；亦可手動即刻同步</Text>
            <Pressable
              {...focusProps('sync-now')}
              hasTVPreferredFocus
              disabled={syncingNow}
              style={[s.syncBtn, focused('sync-now')]}
              onPress={doSyncNow}>
              <Text style={s.syncBtnText}>{syncingNow ? '同步中…' : '🔄 立即同步'}</Text>
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
                hasTVPreferredFocus
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

  const settingsModal = settingsOpen && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={() => setSettingsOpen(false)}>
      <Pressable focusable={false} style={s.syncCard} onPress={() => {}}>
        <Text style={s.syncTitle}>⚙ 設定</Text>
        <Text style={s.syncSub}>播放偏好</Text>
        {autoBestToggle}
        {fsOnPlayToggle}
        <Pressable
          {...focusProps('settings-close')}
          hasTVPreferredFocus
          style={[s.syncBtn, focused('settings-close')]}
          onPress={() => setSettingsOpen(false)}>
          <Text style={s.syncBtnText}>完成</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );

  const updateModal = updateReady && (
    <Pressable focusable={false} style={s.overlayBackdrop} onPress={dismissUpdate}>
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
          hasTVPreferredFocus
          style={[s.syncBtn, focused('ota-apply')]}
          onPress={applyUpdate}>
          <Text style={s.syncBtnText}>立即更新</Text>
        </Pressable>
        <Pressable
          {...focusProps('ota-later')}
          style={[s.syncBtnGhost, focused('ota-later')]}
          onPress={dismissUpdate}>
          <Text style={s.syncBtnGhostText}>遲啲</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );

  // ========= LANDSCAPE =========
  if (isLandscape) {
    return (
      <View ref={rootRef} style={[s.root, { paddingTop: topInset }]}>
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

        {/* 中間：標題 + 播放器（遙控器模式換成遙控面板）*/}
        <View style={s.playerCol}>
          {titleBar}
          {role === 'remote' ? remotePanel : playerBlock}
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
        {settingsModal}
        {updateModal}
      </View>
    );
  }

  // ========= PORTRAIT =========
  return (
    <View ref={rootRef} style={[s.rootPort, { paddingTop: topInset }]}>
      <StatusBar style="light" hidden={fullscreen} />
      {!fullscreen && (
        <View style={s.appbar}>
          <Pressable
            {...focusProps('a1-filter')}
            style={[s.glyph, focused('a1-filter')]}
            onPress={() => setSiteOpen((v) => !v)}>
            <Text style={s.glyphText}>A1</Text>
          </Pressable>
          <Text style={s.brandWord} numberOfLines={1}>
            Anime1Player
          </Text>
          <View style={{ flex: 1 }} />
          {roleToggle}
          <View style={{ flex: 1 }} />
          <Pressable
            {...focusProps('settings')}
            style={[s.iconBtn, focused('settings')]}
            onPress={() => setSettingsOpen(true)}>
            <Text style={s.iconBtnText}>⚙</Text>
          </Pressable>
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
        </View>
      )}

      {!fullscreen && (role === 'remote' ? remotePanel : playerBlock)}
      {/* 控制行：片名(走馬燈，填滿空間) · 分流條 · 收起 同一行（角色 toggle 已搬上頂 bar）*/}
      {!fullscreen && selected && (
        <View style={s.portCtrlRow}>
          {titleAnime && (
            <View style={s.ctrlTitleWrap}>
              <Text style={[s.ctrlTitle, { flexShrink: 1 }]} numberOfLines={1}>
                {titleAnime.name}
              </Text>
              <Text style={s.ctrlCount} numberOfLines={1}>
                {' '}
                · 共 {chapters.length} 集
              </Text>
            </View>
          )}
          {srcSelectorBtn}
          {resolving && <ActivityIndicator color={C.cyan} style={{ marginLeft: 4 }} />}
          <Pressable
            {...focusProps('panel-toggle')}
            style={[s.panelToggle, focused('panel-toggle')]}
            onPress={() => {
              const v = !panelOpen;
              setPanelOpen(v);
              setFlag(K.panelOpen, v);
            }}>
            <Text style={s.panelToggleText}>{panelOpen ? '▴ 收起' : '▾ 顯示'}</Text>
          </Pressable>
        </View>
      )}
      {playError && !fullscreen && <Text style={s.err}>{playError}</Text>}

      {/* 固定控制區：揀咗動畫時鎖喺頂，唔跟清單向上捲；可用「收起 / 顯示」手動收合 */}
      {selected && panelOpen && (
        <View style={s.lockedControls}>
          {rangeTabs}
          {loadingChapters ? <ActivityIndicator color={C.cyan} style={{ marginVertical: 12 }} /> : epGridPort}
        </View>
      )}
      {searchFavRow}
      {selected && <View style={s.divider} />}

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(a) => favKey(a)}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => sectionHeader(section.title, section.data.length)}
        renderItem={({ item }) => renderAnimeRow(item)}
        ListEmptyComponent={<Text style={s.empty}>{tab === 'fav' ? '仲未加任何最愛' : '（無符合）'}</Text>}
      />

      {playerHost}
      {siteMenu}
      {sourceMenu}
      {syncModal}
      {settingsModal}
      {updateModal}
    </View>
  );
}
