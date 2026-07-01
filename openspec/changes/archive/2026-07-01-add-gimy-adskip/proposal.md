## Why

gimy 嘅 `清晰雲`(`modum3u8` / `play.modujx10.com`)線路用**同 anime1 一模一樣嘅 server-side ad-stitching**:廣告 `.ts` 段直接縫入 m3u8,前後夾 `#EXT-X-DISCONTINUITY`,而且廣告段來自唔同 path-id(`/20260629/Qdb2NZnp/10155kb/…`,唔同日期、高碼率)。實測 4 集每集有 **5–6 個廣告位、~90–105 秒**,而且高碼率廣告段最容易播到卡。

現有 `lib/adskip.ts` 嘅 `detectAdRanges`(path-id 為基準)**零改動就 100% 命中**呢啲廣告,但 `lib/sources/maccms.ts` 因為一句過時註解(「adDetector 唔設:CDN 同 anime1 唔同」)而冇啟用 —— 呢個假設對 modu 線路係錯嘅。啟用後即刻幫 gimy 用戶自動跳廣告。

## What Changes

- `maccms` provider 啟用 `adDetector`(重用 `getAdRanges`,同 anime1 / anime1.me 一致),令 gimy 直連 m3u8 線路自動偵測 + 跳廣告。
- 加 unit test:用今次抽到嘅**真實 playlist fixture**(modu 有廣告 / xluuss 無廣告)鎖住偵測行為。
- (design 決定)可選:只喺已知會 stitch 廣告嘅 host 上先跑 detector,慳其他線路一個 m3u8 fetch。
- 移除 / 更正 `maccms.ts` 嗰句過時註解。

無 breaking change:其他 gimy 線路(xluuss / okm3u8 / 解析線)偵測唔到外來 id 或 fetch 失敗時 `getAdRanges` 回 `[]`,**唔會誤跳正片**。

## Capabilities

### New Capabilities
- `gimy-adskip`: gimy(maccms)直連 m3u8 線路嘅廣告偵測 —— 重用 path-id HLS 偵測,對 stitched-ad 線路(modu)跳廣告,對無廣告 / 不可解析線路安全回空。

### Modified Capabilities
<!-- 無 spec-level 行為改動;source-provider 合約本身已有 optional adDetector,今次只係為 maccms 實作。 -->

## Impact

- 程式碼:`lib/sources/maccms.ts`(啟用 `adDetector` + import `getAdRanges`);`lib/__tests__/`(新 fixture + test)。
- 執行期:啟用 adDetector 嘅線路每集多一個 m3u8 fetch(anime1 一直如此;有 try/catch)。需傳同播放一致嘅 headers(`Referer: <gimy 站>` + UA)。
- 交付:純 JS → OTA(runtime 不變)。屬 source/scraper 改動 → 跟 memory `verify-scrapers-live-before-ota` 做多 agent live 驗證 gate 先 OTA。
