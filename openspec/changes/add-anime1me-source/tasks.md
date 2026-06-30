## 1. Pin 實 player API（實作第一步,先除未知數）✓

- [x] 1.1 用 Playwright pin 實:`data-apireq="{c,e,t,p,s}"` → **POST `https://v.anime1.me/api`**(form `d=<apireq>`)→ `{s:[{src:"//<host>.v.anime1.me/..mp4"}]}`
- [x] 1.2 關鍵發現:API **需 `.anime1.me` httpOnly cookie**(無 cookie → 403 Signature invalid);mp4 host 會輪替(`miru`/`hinata`…)→ 一定由 API 攞,唔可 hardcode;prev/next = `/?p=<id>`

## 2. Provider 實作 `lib/sources/anime1me.ts` ✓

- [x] 2.1 `anime1meProvider`（`id:'anime1me'`、`label:'anime1.me'`）
- [x] 2.2 `loadCatalog()`：fetch `animelist.json` → `mapCatalog` → `Anime[]`（`site=https://anime1.me`、`slug=<catId>`）
- [x] 2.3 過濾 **`catId===0`**（18+，number/string 都隔）—— 信號制,唔 hardcode 數量
- [x] 2.4 `getEpisodes(a)`：fetch `?cat=<catId>` + 跟分頁（cap 25）→ 單一 `PlayLine`，舊→新
- [x] 2.5 `getEpisode(url)`：episodeNo + 上/下集（`/?p=`）+ 候選 `embedUrl=集數頁`
- [x] 2.6 `resolveStream(embed)`：re-fetch 集數頁攞新鮮 apireq → POST API → 直接 mp4（失敗 null）
- [x] 2.7 `adDetector = getAdRanges`（共用 anicdn）

## 3. Registry ✓

- [x] 3.1 `providers` 加 `anime1me`
- [x] 3.2 `getProviderBySite`：`site.includes('anime1.me')` → anime1me；其餘原樣
- [x] 3.3 `getProvider(a)` 用 `a.site` 解析正確（test 覆蓋）

## 4. App wiring + 18+

- [x] 4.1 `SITES` 加 `me:'https://anime1.me'` → 自動成為第 4 個 catalog 來源；`loadList` 經 `getProviderBySite` 路由去 anime1me（**唔改 .in/.one/.cc 行為**）
- [x] 4.2 設定面板自動多一個「anime1.me」toggle（沿用 `enabledSites`，預設開）
- [x] 4.3 18+ 處理 = **provider 層硬隱藏**（`loadCatalog` drop catId=0）；**MVP 唔做「顯示 18+」toggle**（owner 決定）
- [x] 4.4 來源重複：**MVP 接受**（owner 揀選項 3）；用戶可自行喺設定熄鏡像。日後想清走可加「名稱去重」(另開 change)

## 5. 測試 ✓

- [x] 5.1 unit：`animelist.json` fixture → map 正確 + **catId=0 全部隔走**
- [x] 5.2 unit：分類頁 fixture → `getEpisodes`/`parseEpisodeList` 舊→新、重新編號
- [x] 5.3 unit：`parseApireq` / `parseAdjacent` / `parseApiSource` / registry 解析（me→anime1me、in→anime1）
- [x] 5.4 `npx tsc --noEmit` + `npm test` 綠（92/92）

## 6. 驗證（手機 smoke，OTA 前必做）— 待 owner 落機

- [ ] 6.1 由 anime1.me 來源揀片 → 播；上一集/下一集；拖進度
- [ ] 6.2 確認**成人番完全唔現身**（anime1.pw 名單任一隻搵唔到）
- [ ] 6.3 廣告自動跳正常
- [ ] 6.4 Regression：`.in/.one/.cc` 清單 / 播放 不變
- [ ] 6.5 ⚠️ 重點驗 cookie：RN 原生 fetch 要把 anime1.me 嘅 session cookie 帶去 `v.anime1.me/api`；若 403/播唔到,需確認 cookie 跨 subdomain 行為（或 getEpisode→resolveStream 同一 session）
- [ ] 6.6 ⚠️ 驗 mp4 播放 Referer：`loadStream` 用 `embedUrl` origin(=anime1.me) 做 Referer;若 mp4 403 試 `https://v.anime1.me/`

## 7. 部署 — 待 owner

- [ ] 7.1 branch `feat/add-anime1me-source` + 多 agent 驗證 + review（純 JS / OTA）
- [ ] 7.2 OTA：改 `app.json` `releaseNotes` + 觸發「Publish OTA」→ 手機收更新後再 smoke 一次
