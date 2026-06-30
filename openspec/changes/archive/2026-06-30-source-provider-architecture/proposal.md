## Why

而家成個 app **寫死咗 anime1**:`App.tsx` 直接 `import` `lib/anime1.ts` 嘅 function(`parseHomeList`/`buildChapters`/`parseEpisode`/`resolveSource`…),冇任何抽象層。想加第二個來源(例如 **gimy**,DOM 完全唔同、要搜尋/分頁、有多條播放線路)就要喺 `App.tsx` 周圍插 if-else,愈嚟愈難維護 —— 違反 AGENTS.md「邏輯唔可以住喺 UI 檔」嘅規矩。

呢條 change 喺 UI 同「來源抽取」之間劃一條清楚界線(一個 `SourceProvider` 合約),令 anime1 變成**第一個** provider。將來加來源 = 寫多一個 provider module + 登記,`App.tsx` 一行都唔使改。

**本 change 係純重整(behavior-preserving):** anime1 行為一模一樣,唔加新來源。gimy 係**另一條 change**(見 Out of scope),呢條只係幫佢鋪路。

## What Changes

- **新合約** `lib/sources/types.ts`:`SourceProvider` interface —— Player ↔ Plugin 之間唯一語言。
  - `loadCatalog()` 名單;`search?()` 預留(anime1 唔使,gimy 將來用)。
  - `getEpisodes(anime)` → `PlayLine[]`(套戲層「線路」;anime1 回 1 條)。
  - `getEpisode(url)` → streams(集層「分流」播放器)+ 上/下集。
  - `resolveStream(embedUrl)` → **拆到底嘅直接 `.m3u8`/`.mp4` 網址**(player 只食直接網址,冇 WebView 後備)。
  - `adDetector?(m3u8Url)` → **optional**:廣告偵測係 source-specific(`lib/adskip.ts` 寫死 anime1 CDN path 格式)。anime1 實作;其他來源唔實作就自動唔跳,唔會誤跳真內容。
- **登記處** `lib/sources/registry.ts`:`{ anime1 }` map + `getProvider(anime)`(用 `anime.site` / provider id 解析)。
- **包 anime1**:`lib/sources/anime1.ts` 將現有 function 包成 `anime1Provider`;現有純函數**照留**(`lib/anime1.ts` 維持,registry 引用),現有 `anime1.test.ts` 繼續綠。
- **接線 App.tsx**:由直接 import anime1 改成經 `getProvider(...)` 叫合約方法。**得 anime1 一個 provider,行為理應一模一樣。**

**明確唔做(維持現狀):**
- `favKey = site + '|' + slug` **不變** —— `site` 係完整域名,各來源天生唔撞(`https://anime1.in` vs `https://gimy.xxx`),收藏/進度/sync **唔使搬遷**。
- in/one/cc 三鏡像暫時**留喺 App**(階段 4 先考慮收入 provider 內部);呢條 change 唔郁鏡像/`enabledSites`/設定面板。

## Capabilities

### New Capabilities
- `source-provider`: 所有內容來源經統一 `SourceProvider` 合約存取;`App.tsx` 唔再直接認得任何具體來源;一個 registry 由 anime 解析返對應 provider;provider 負責把片源拆到可直接播嘅 URL。

### Modified Capabilities
- 無(本 change 為純重整,anime1 對用戶行為不變;現有 capability spec 不改)。

## Impact

- 新增:`lib/sources/types.ts`、`lib/sources/registry.ts`、`lib/sources/anime1.ts`(包裝層)。
- 改:`App.tsx`(L27–34 import、`loadList`、`openAnime`、`playEpisode`、`loadStream`、play 路徑嘅 `getAdRanges` 呼叫 改用 provider);其他 `import type { Anime }` 維持(型別名唔改,churn 最細)。
- 保留:`lib/anime1.ts` 純函數 + `lib/adskip.ts`(包成 `anime1Provider.adDetector`)+ `lib/__tests__/anime1.test.ts`。
- 純 JS → **OTA 派得,唔使 rebuild native**;跟 memory 規矩開 branch + review。
- **風險集中喺接線階段**(郁到 player / 遙控 / state 時序):`tsc` 驗唔到行為,**OTA 前必須手機 smoke test**(揀片→播、上下集、拖進度、遙控、設/清標記)。
