## 1. 抽 fixture

- [x] 1.1 抽一個「有 stitched 廣告」嘅 modu media playlist(如 清晰雲 仙逆 ep1,`play.modujx10.com/…/1105kb/hls/index.m3u8`),存做 `lib/__tests__/fixtures/gimy-modu-ads.m3u8`(連 variant 內容)。
- [x] 1.2 抽一個「無 stitched 廣告」嘅 playlist(如 xluuss 線路),存做 `lib/__tests__/fixtures/gimy-noads.m3u8`。
- [x] 1.3 記低每個 fixture 對應嘅 mediaUrl(pathId 判定要用),寫喺 test 內。

## 2. 加測試（先 red）

- [x] 2.1 `lib/__tests__/adskip.test.ts`(或現有 adskip test):load modu fixture → `detectAdRanges` 應回多個 `AdRange`、總廣告時長 > 0。
- [x] 2.2 對 noads fixture → `detectAdRanges` 應回 `[]`。
- [x] 2.3 (可選)斷言正片段唔喺任何 `AdRange` 內(揀 fixture 中一個已知正片時間點驗證)。

## 3. 啟用 adDetector

- [x] 3.1 `lib/sources/maccms.ts`:`import { getAdRanges } from '../adskip';`。
- [x] 3.2 喺 provider factory 加 `adDetector: (u, h) => getAdRanges(u, h)`;更正 / 移除 line 258 過時註解。
- [x] 3.3 確認 provider resolve 出 m3u8 時嘅 `headers`(Referer + UA)有傳落 `adDetector`(對齊播放路徑)。

## 4. 驗證

- [x] 4.1 `npx tsc --noEmit` + `npm test` 全綠。
- [x] 4.2 **多 agent live 驗證**(跟 memory `verify-scrapers-live-before-ota`):實機 / 腳本抽多條線路多集,確認 modu 有廣告區間、其他線路回 `[]`、fetch 失敗安全。
- [x] 4.3 手機 smoke test:gimy 清晰雲揀片 → 播到廣告位自動跳過;其他線路正常播、唔誤跳。

## 5. 交付

- [ ] 5.1 新 branch → commit(`--no-ff` merge 返 master)→ push。
- [ ] 5.2 改 `app.json` releaseNotes → OTA 發佈(runtime 不變)。
- [ ] 5.3 `openspec archive add-gimy-adskip`(spec 入 `openspec/specs/gimy-adskip/`)。
