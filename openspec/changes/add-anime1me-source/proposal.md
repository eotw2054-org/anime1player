## Why

`anime1.me` 係 anime1 **正源**(站內明寫只用此域名,其餘 `.in/.one/.cc` 係鏡像),長遠最穩。但佢同現有 `anime1Provider`(針對 `.in/.one/.cc`)**結構完全唔同**,現有抽取邏輯一行都用唔到佢:

- 目錄唔喺 HTML,要由 **`https://anime1.me/animelist.json`**(1854 行 `[catId, name, 集數, 年, 季, 字幕組]`)攞。
- 戲嘅網址係 **`?cat=<catId>`**,唔係 `/slug/`;集數網址唔可以用 `buildChapters` 算。
- 集數係**分類頁上嘅 `<article id="post-N">` 貼文(有分頁)**。
- 播放器係 **`<video data-apireq="{c,e,…}">` → POST 去 player API**,唔係 iframe embed。

啱啱完成嘅 `source-provider-architecture` 就係為咗呢個 —— 加 anime1.me = 寫多一個 `SourceProvider`,`App.tsx` 一行唔使改。呢個亦係個架構嘅**第一個真實驗證**。

順帶解決 owner 要求嘅 **18+ 自動過濾**:anime1.me 目錄入面成人番嘅 `catId === 0`(name 連去 `anime1.pw`,今日 19 隻,數量會浮動),`loadCatalog` 直接隔走。

## What Changes

- **新 provider** `lib/sources/anime1me.ts`(`id:'anime1me'`):
  - `loadCatalog()` → fetch `animelist.json` → map 成 `Anime[]`;**過濾 `catId === 0`**(成人)。
  - `getEpisodes(a)` → fetch 分類頁(含分頁)→ 收集 `article` 貼文 → `PlayLine[]`(單線路)。
  - `getEpisode(url)` → 由貼文頁 decode `data-apireq` 砌候選 stream + 上/下集。
  - `resolveStream(embed)` → POST player API → 直接 `.m3u8`/`.mp4`。
  - `adDetector` → **共用** `getAdRanges`(同一 anicdn)。
- **registry**:登記 `anime1me`;`getProviderBySite('https://anime1.me')` → `anime1meProvider`。
- **catalog wiring**:`App.tsx` 嘅站台 loop 加入 anime1.me 作為一個來源(設定面板多一個 toggle);鏡像處理維持現狀。
- **18+ toggle**(可選):預設隱藏成人;設定面板加開關(信號 = `catId===0`,**唔 hardcode 數量**)。

**明確唔做:**
- 唔改現有 `anime1Provider`(`.in/.one/.cc`)行為。
- 唔做 gimy(另一條 change)。
- 唔改 `favKey`(`site|slug`;anime1.me 嘅 `site=https://anime1.me`,天生唔同鏡像撞)。

## Capabilities

### New Capabilities
- `anime1me-source`: 透過 `SourceProvider` 合約接入 anime1.me(JSON 目錄 + `?cat=` 分類頁 + `data-apireq` 播放器),並喺目錄層自動隔走成人番(`catId===0`)。

### Modified Capabilities
- 無(經由 `source-provider` 合約新增一個 provider;現有 capability 行為不變)。

## Impact

- 新增:`lib/sources/anime1me.ts` + `lib/sources/__tests__/anime1me.test.ts`。
- 改:`lib/sources/registry.ts`(登記 + site 解析)、`App.tsx`(站台 loop / 設定面板加 anime1.me;可選 18+ toggle)。
- 共用:`lib/adskip.ts`(`adDetector`)。
- 純 JS → **OTA 派得,唔使 rebuild native**;跟 memory 規矩 branch + review。
- **風險**:player API(`data-apireq` POST)係 runtime 行為,`tsc` 驗唔到 → **OTA 前手機 smoke test**(由 anime1.me 揀片→播、上下集、拖進度、確認成人番唔現身)。
- anime1.me 用 Cloudflare;`fetchHtml` 用緊嘅 UA / headers 要試實未被擋(investigation 中 curl `animelist.json` 直 GET 試過要啱 referer)。
