## Context

`lib/adskip.ts` 已有成熟嘅 HLS 廣告偵測(`getAdRanges` → `detectAdRanges`),原理:由每個 `.ts` segment 嘅 path 抽「content id」(`/<date>/<ID>/<bitrate>/hls/`),揀總時長最長嗰個 id 做正片,凡連續非正片 id 段就當廣告區間。anime1 / anime1.me provider 都設咗 `adDetector: (u,h)=>getAdRanges(u,h)`。

`maccms` provider(gimy 家族)目前 **冇** 設 `adDetector`([maccms.ts:258](../../../lib/sources/maccms.ts) 一句過時註解)。實測(2026-07-01,`gimyplus.com/vod/245516.html` 仙逆)證實:

| 線路 | from / host | 廣告結構 | detector 結果 |
|---|---|---|---|
| 清晰雲 | `modum3u8` / play.modujx10.com | 縫入外來 id `Qdb2NZnp`(高碼率)+ `#EXT-X-DISCONTINUITY` | ✅ 每集 5–6 段 ~90–105s,命中 |
| 速播雲/新浪雲 | subm3u8/xlm3u8 / xluuss.com | 單一 id,無 discontinuity | `[]`(安全) |
| OK/無盡/極速雲 | okm3u8/wjm3u8/jsm3u8 | m3u8 抽唔到(headers/地區/巢狀) | `[]`(try/catch) |
| 騰訊/4K/藍光/高清 | qq 等官方平台**解析**線 | 非直連 m3u8 | app 本身唔會揀 |

## Goals / Non-Goals

**Goals:**
- gimy 直連 m3u8 線路(尤其 modu 清晰雲)自動偵測 + 跳廣告,體驗同 anime1 睇齊。
- 零 false-positive:唔會誤跳正片。
- 用真實 playlist fixture 鎖住行為(regression 保護)。

**Non-Goals:**
- 唔處理官方平台**解析線**(qq/iqiyi…)嘅廣告 —— 嗰啲唔係直連 m3u8,app 唔會揀。
- 唔改 `detectAdRanges` 核心演算法(已證實適用)。
- 唔做 UI(跳廣告係播放器 `adSkipTarget` 既有行為)。

## Decisions

1. **重用 `getAdRanges`,唔特製 gimy 版**。modu 嘅 path 結構(`/<date>/<id>/<bitrate>/hls/`)同 anime1 相同,現有 `pathIdOf` 正則(`/\/\d{6,8}\/([^/]+)\//`)直接 work。→ `maccms.ts` 加 `adDetector: (u,h)=>getAdRanges(u,h)`。

2. **要唔要按 host gate?** 兩個選項:
   - **(A) 唔 gate(推薦起步)**:所有 maccms 直連 m3u8 都跑 detector。無廣告線路 fetch 完見單一 id → 回 `[]`。代價:每集多一個 m3u8 fetch(anime1 一直如此)。最簡單、最少 assumption。
   - (B) 只喺 known-ad host(modu*)先跑,慳其他線路 fetch。代價:host allowlist 要維護,新 CDN 要更新。
   → **採 (A)**;(B) 留作日後 perf 優化(如發現多線路 fetch 拖慢揀線)。

3. **content-id 判定**:`detectAdRanges` 優先用 playlist URL 自己嘅 id;modu variant URL(`/20240304/6aJSbktn/1105kb/hls/index.m3u8`)嘅 id 一定喺 segment set 入面 → 正確。fallback「最長時長」亦成立(正片遠多於廣告)。**唔使改**。

4. **headers**:`adDetector(m3u8Url, headers)` 用同播放一致嘅 `headers`(`Referer: <gimy origin>` + UA)。maccms provider resolve 出 m3u8 時已帶呢組 headers → 直接傳落 `getAdRanges`。

5. **測試**:抽真實 media playlist(modu 有廣告、xluuss 無廣告)存做 fixture,對 `detectAdRanges` 斷言(有廣告集回 5–6 段、無廣告集回 `[]`)。純字串輸入,唔使網絡。

## Risks / Trade-offs

- **每集多一個 m3u8 fetch**(啟 detector 嘅線路):anime1 既有代價,可接受;失敗有 try/catch → `[]`。
- **CDN 結構日後變**:若 modu 改 path 結構,fixture test 會過但真實可能漏跳 → 靠 `verify-scrapers-live-before-ota` live gate 補。
- **廣告 id 剛好比正片長**(理論):偵測會反轉。實測正片 ~1500s vs 廣告 ~100s,極不可能;真出事亦只係跳錯,唔會 crash。
- **地區限制**:部分線路 m3u8 喺某些網絡 403 → `getAdRanges` catch → `[]`,唔影響播放。
