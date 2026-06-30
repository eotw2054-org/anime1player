## Context

`App.tsx` 直接 import `lib/anime1.ts`,六個耦合點全部假設 anime1:

| 位置 | 假設 | 對 gimy |
|---|---|---|
| `SITES` | 來源 = 一組鏡像域名 | ❌ 模型錯 |
| `parseHomeList` | **全目錄一版**(`#tablepress-1`) | ❌ gimy 要搜尋/分頁 |
| `buildChapters` | 集數網址可算(`slug-10NNN000`) | ❌ gimy 要 fetch 詳情頁 |
| `openAnime` regex | `href="/slug-..."` 集數連結 | ❌ DOM 唔同 |
| `parseEpisode` | `.play-select`/`iframe.vframe`/`#other` | ❌ DOM 唔同 |
| `resolveStream` | sniff video/iframe/m3u8 | ⚠️ 部分可重用 |

底層硬限制:播放用 `expo-video` 食**直接 `.m3u8`/`.mp4`,冇 WebView 後備**。所以無論 DOM 幾古怪,provider 最尾一定要吐直接網址。

「分流」有兩個意思,合約要分開:
- **集層分流** = 同一集唔同播放器(anime1 `.play-select`/`#other`)→ `getEpisode().streams`。
- **套戲層線路** = 唔同線路各自一套集數(gimy 播放線路①②③)→ `getEpisodes()` 回 `PlayLine[]`。

## Goals / Non-Goals

**Goals:**
- 喺 UI 同來源抽取之間劃一條合約;anime1 變第一個 provider。
- 純重整:anime1 對用戶行為**完全不變**;每階段獨立、可 rollback。

**Non-Goals:**
- 唔加 gimy(另一條 change)。
- 唔搬 `favKey` / 收藏 / 進度 / sync(域名天生分隔,唔使)。
- 唔郁 in/one/cc 鏡像、`enabledSites`、設定面板(階段 4 先考慮)。
- 唔加多線路 UI(合約預留 `PlayLine[]`,但 UI 仍用 `lines[0]`)。
- 唔改 native;純 JS / OTA。

## Decisions

1. **合約用「Player 問 / Plugin 答」嘅一組 function,唔係一嚿 data** —— 因為集數、片源都係 lazy(要 fetch)。`SourceProvider`:
   ```ts
   interface SourceProvider {
     id: string; label: string;
     loadCatalog(): Promise<Anime[]>;
     search?(q: string, page?: number): Promise<Anime[]>;
     getEpisodes(a: Anime): Promise<PlayLine[]>;     // ≥1 條線路
     getEpisode(url: string): Promise<EpisodeInfo>;  // streams + prev/next
     resolveStream(embedUrl: string): Promise<string | null>;
     adDetector?(m3u8Url: string, headers?: Record<string,string>): Promise<AdRange[]>; // 見決定 7
   }
   ```

   **保留兩步(`getEpisode` 候選 → `resolveStream` 單條),唔合併:** 現有行為靠呢個拆分 —— `parseEpisode` 回**未解析嘅候選 embed**,app 先 `probeStreams` 量延遲、俾你切分流,**只解析你睇緊嗰條**(lazy)。若合併成 `resolveStream(chapterUrl) → StreamInfo[]` 就要 eager 解析全部候選(慢 + 改行為),仲冇位放 `prev/next`(auto-advance / 上下集制要用)。故維持兩步。
   `loadCatalog` 同 `search?` 都係取名單方法,provider **至少實作一個**:anime1 **冇 server 搜尋**(現搜尋係本機 filter 全表)→ 實作 `loadCatalog`,唔好迫佢 `search('')` 扮;gimy → 實作 `search`/分頁。

2. **型別沿用現有 `Anime`/`Chapter`/`EpisodeInfo`/`AdRange`,唔改名** —— 全 project import 唔使郁,churn 最細。新增 `PlayLine = { label: string; episodes: Chapter[] }`。

3. **`getEpisodes` 一開始就回 `PlayLine[]`(唔係 `Chapter[]`)** —— 一次過設計啱,慳將來加 gimy 線路時嘅第二次合約搬遷。anime1 回**單一線路** `[{ label:'預設', episodes: chapters }]`,封裝現有 `buildChapters` / 詳情頁 regex 兩條路(含 `a.num` 快速路徑)。UI 暫時淨係用 `lines[0]`,行為不變。

4. **`favKey` 不變;靠域名分隔** —— `site + '|' + slug`,各 provider 嘅 `Anime.site` 係自己域名,天生唔撞。`provider id` 概念用嚟解析 registry,唔影響 key。零資料搬遷。

5. **in/one/cc 鏡像階段 1–3 留喺 App** —— 收入 provider 內部會改埋行為同 UI(唔再純重整),拆做**可選階段 4**,等架構穩定先做。

6. **registry 解析:`getProvider(a: Anime)`** —— 暫時用 `a.site` 比對(anime1 域名 → `anime1Provider`),揾唔到 fallback `anime1Provider`(現只此一家)。將來 provider 多咗可改用顯式 `a.providerId`。
   **`provider.id` 同 `favKey` 解耦:** `id`(如 `'anime1'`)淨係 registry 解析用;`favKey` 維持 `site + '|' + slug`(完整域名)。所以 in/one/cc 三鏡像同一套戲**唔會撞 key**(三個 site 唔同),亦零搬遷 —— **唔好**把 key 縮成 `id|slug`。

7. **廣告偵測係 provider 嘅 optional capability** —— 現有 `lib/adskip.ts` 嘅 `pathIdOf` regex(`/\d{6,8}\/([^/]+)\//`)同 server-side ad-stitching 假設**寫死 anime1 CDN**(ffzy/kkzy…);`App.tsx:662` 喺解到 m3u8 後直接 call `getAdRanges`。本 change 把佢包成 `anime1Provider.adDetector`(行為不變,只搬位)。play 路徑改成:`provider.adDetector ? 呼叫 : 跳過`。gimy 等 CDN 唔同/server-stitch 唔同/根本冇廣告 → 唔實作 `adDetector` 就自動唔跳,唔會誤跳真內容。

## Risks / Trade-offs

- **[接線階段風險最高]** 郁 player/遙控/state 時序,`tsc` 驗唔到行為 → OTA 前**手機 smoke test**(已列 tasks 3.x)。
- **[一次過用 `PlayLine[]` 多包一層]** 階段 1 略繁,但避免第二次合約搬遷 —— 接受。
- **[`resolveStream` 最脆]** gimy 播放器多數加密,係將來最易爆嘅位;但本 change 唔掂 gimy,只把現有 anime1 `resolveSource` 原樣搬入,風險不變。
- **[registry 用 `site` 解析]** 簡單但隱式;只此一家時可接受,多 provider 時改顯式 id。
- **[合約屬「臨時」,要等 gimy 驗證]** 名言:「為兩個來源設計嘅合約先係好合約;為一個設計只係估」。本 change 只有 anime1 一個 impl,合約未經第二來源檢驗 —— 接受先定形、預期加 gimy 時可能要細調(例如 `loadCatalog` vs `search`/分頁邊個必需)。**所以 gimy 應盡快做**(下一條 change),越早暴露界線畫錯嘅位越好。

## Migration Plan

- 純 JS,分階段(見 tasks):0 定型別 → 1 包 anime1 → 2 registry → 3 接線 App。每階段 `tsc --noEmit` + `npm test` 綠先落下一步;階段 3 後手機 smoke test。
- Rollback:任何階段 revert commit;已派則 OTA 回滾。

## Out of scope —— 另開 change

- **`gimy` provider**:寫 `lib/sources/gimy.ts`(搜尋/分頁/多線路抽取)+ 搜尋/分頁/線路切換 UI。本 change 完成後先做,係佢嘅「證明可行」後續。
- 多線路播放 UI、鏡像收口(階段 4)、registry 改顯式 `providerId`。

## Open Questions

- 無(兩個取捨已由顧問判斷拍板:`PlayLine[]` 一次過用;鏡像暫留 App)。
