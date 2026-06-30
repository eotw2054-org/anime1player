## Context

由 Playwright 實地勘查 `anime1.me`(JS 渲染,curl 睇唔到)得出嘅實況:

**目錄** `GET https://anime1.me/animelist.json?_=<ts>` → 1854 行,每行:
```
[ catId:number, nameHtml:string, 集數:string, 年份:string, 季節:string, 字幕組:string ]
例:[1907, "THE WORLD IS DANCING 世界在起舞", "連載中(01)", "2026", "夏", ""]
成人:[0, "<a href=\"https://anime1.pw/?cat=60\">這樣高大的女孩子你喜歡嗎？</a>", "1-12", "2026", "春", "桜都"]
```
**成人 = `catId === 0`**(name 連去 `anime1.pw`)。今日 19 隻;**數量會浮動**(季番加減)。

**戲頁** `https://anime1.me/?cat=<catId>` = WordPress 分類archive。每集 = `<article id="post-<N>">`,內含 `<video data-apireq="<urlencoded JSON>">`。`data-apireq` decode 後 ≈ `{"c":"1866","e":"...","t":...,"p":...}`(c=catId)。分類頁**有分頁**(`.nav-links`/`page-numbers`),長番要逐頁收。

**播放器**:唔係 iframe。`<video data-apireq>` 由 JS POST 去 player API(實作時確認:`POST https://v.anime1.me/api`,body `d=<data-apireq>`,回 `{s:[{src,type}]}` 之類)→ 直接 m3u8/mp4。

對比現有 `anime1Provider`(`.in/.one/.cc`):目錄(HTML 表)、URL(`/slug/`)、集數(`buildChapters` 算)、播放器(`iframe.vframe`/`.play-select`)**全部唔同**。⇒ anime1.me 係**獨立 provider**,唯一可共用 = `adDetector`(同一 anicdn m3u8)。

## Goals / Non-Goals

**Goals:**
- 以 anime1.me 作為一個 `SourceProvider` 接入,App 經 registry 用,唔改 App data flow 核心。
- 目錄層自動隔走 18+（`catId===0`）。

**Non-Goals:**
- 唔改現有 `anime1Provider`(`.in/.one/.cc`)。
- 唔做 gimy;唔改 `favKey`;唔加 native(純 JS/OTA)。
- 唔做成人番嘅播放(直接喺目錄隔走,連 episode/player 都唔掂)。

## Decisions

1. **獨立 provider `lib/sources/anime1me.ts`(`id:'anime1me'`)** —— 同 `.in/.one/.cc` 共通點得 `adDetector`,夾埋一個 provider 只會多 if-else。`adDetector` 直接引用 `getAdRanges` 共用。

2. **`Anime` 形狀沿用;`slug` 用 `cat=<catId>` 編碼** —— `favKey = site|slug`,`site='https://anime1.me'`、`slug='cat=1907'`(或 `'1907'`)。咁同鏡像(`site=https://anime1.in`)天生唔撞,零搬遷。`name` 取 row[1](成人已隔,正常 row 係純文字;保險仍 strip tags)。`num`/`cntText` 由 row[2]「集數」沿用現有 parse(`連載中(01)`→null/數字邏輯同 `parseHomeList` 一致),`updateYear` 用 row[3]。

3. **18+ 隔喺 `loadCatalog`,信號 `catId===0`,唔 hardcode 數量** —— 最早、最省（episode/player 都唔會掂成人)。預設隱藏。設定面板**可選**「顯示 18+」toggle（AsyncStorage),預設 off;開咗就唔 filter。MVP 可先硬隱藏,toggle 後補。

4. **`getEpisodes` fetch 分類頁 + 跟分頁** —— 由 `?cat=<catId>` 起,收集 `article#post-N`(連結/標題/集號),見到下一頁就續抓,合成單一 `PlayLine`。集號由標題 `[NN]` 或貼文次序定。**唔用** `buildChapters`。

5. **`getEpisode` + `resolveStream` 經 `data-apireq` → player API** —— `getEpisode(postUrl)` 抽 `data-apireq`(+ 分類頁/貼文嘅上下集連結)做候選 stream;`resolveStream` 拿 `data-apireq` POST player API 攞 m3u8。**確切 endpoint/payload/headers 喺實作時用 Playwright 攔網絡再 pin 實**(已知大方向:`v.anime1.me/api`)。保留兩步(候選→解析)同現有合約一致。

6. **registry 顯式認 anime1.me** —— `getProviderBySite(site)`：`site.includes('anime1.me')` → `anime1meProvider`;否則行返原本(anime1/ fallback)。`providers` map 加 `anime1me`。

7. **catalog wiring 用「site 字串」而非 `SITES` key** —— 現有 `loadList` loop `Object.keys(SITES)`(in/one/cc)。anime1.me 唔屬 `SITES`(佢資料源唔同)。實作時或者:擴 `SITES` 加 `me:'https://anime1.me'` 但 provider 解析行 .me 分支;或另建「catalog sources」清單。傾向**擴一個來源清單**(site→providerId),令設定面板/loadList 一致迭代。細節實作時定,**唔改鏡像行為**。

## Risks / Trade-offs

- **[player API 未 pin 實]** `data-apireq` 嘅 POST endpoint/headers 係最大未知 —— 實作第一步用 Playwright 攔截真實請求先寫。`tsc` 驗唔到 → 手機 smoke 必做。
- **[Cloudflare / headers]** `animelist.json` 直 GET 可能要啱 Referer/UA;沿用 `fetchHtml` 嘅 UA,必要時加 `Referer: https://anime1.me/`。
- **[分頁抓集]** 長番多頁,要正確跟到尾;抓漏 = 缺集。unit test 用 fixture HTML 覆蓋。
- **[18+ 信號變]** 若 anime1.me 將來改用其他標記(非 `catId===0`),filter 會失效 —— 接受,信號簡單且今日 100% 命中;加 test 守住。
- **[catalog source 模型]** 把 anime1.me 塞入現有 `SITES`-based loop 有少少彆扭,可能微調 wiring;限定唔改 `.in/.one/.cc` 行為。

## Migration Plan

- 純 JS。實作序:(1) Playwright pin player API → (2) 寫 provider + test → (3) registry → (4) App wiring + 18+ → (5) tsc/test 綠 → (6) 手機 smoke → OTA。
- Rollback:registry 唔登記 anime1me / App 唔加該來源即回復;已派則 OTA 回滾。

## Open Questions

- player API 確切 endpoint / payload / 回應格式(實作第一步用 Playwright 網絡攔截確認)。
- 「顯示 18+」toggle 要唔要做 MVP,定先硬隱藏?(傾向先硬隱藏,toggle 後補 —— 已記決定 3。)
