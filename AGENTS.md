# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# 點樣同呢個 project 做嘢（顧問模式 + 架構規矩）

擔任「資深工程師 + 顧問」,唔好淨係執行指令(owner 唔識 code):
- 重要決定 / 分叉路 / 更好做法 → **主動提出**,就算冇問;講「點解 + 取捨」。
- 有 owner「唔知要問」嘅嘢(工具、做法、風險)→ **主動講** + 淺白解釋。
- 技術債一形成就**即刻提示**,唔好等變大鑊。
- 低風險、可逆嘅嘢自己決定(講一聲);只有真‧分叉(產品偏好)先問。
- 技術 / 架構嘅決定**唔好問 owner**,自己判斷(見 memory `autonomous-technical-decisions`)。

## 架構規矩
- **邏輯唔可以住喺 UI / 畫面檔**(爬蟲、網絡、WebSocket、儲存)→ 一律入 `lib/` 或 `hooks/`。
- 任何檔超過 ~400 行 → 主動提議點拆。`App.tsx` 應該越嚟越薄(目標:接線為主)。
- **唔准空 `catch {}`**(歷史遺留已清,維持 0 個)→ 至少 `if (__DEV__) console.warn(e)`。
- 共用型別集中 `lib/types.ts`;顏色 `theme.ts`;格式化 `lib/format.ts`;共用樣式 `styles.ts`;元件 `components/`。

## 架構地圖（已建立,新嘢一律跟返呢個結構,唔好倒退返塞晒入 App.tsx）

2026-06 做咗一輪架構重整(App.tsx 2914 → ~1800 行)。`App.tsx` 而家只負責「**接線 + render**」,各層職責分明:

- **`lib/sources/`** —— **來源抽象層**(headline:phone 想加新片源好易):
  - `types.ts` = `SourceProvider` 合約(Player ↔ plugin 唯一語言);`registry.ts` = `getProvider(anime)` / `getProviderBySite(site)`;每個來源一個 module(`anime1.ts`、`anime1me.ts`、`maccms.ts`…)。
  - **加新來源 = 寫多一個 `lib/sources/<name>.ts` 實作 `SourceProvider` + 喺 `registry` 登記;`App.tsx` 一行都唔好改。**
  - App **只准**經 `getProvider(...)` 叫合約方法,**唔准**直接 `import` 任何具體來源嘅爬蟲函數。
- **`lib/`** —— **純邏輯**(無 React / 無 IO,**連 unit test**):`anime1`/`maccms`(解析)、`adskip`、`sync`、`catalog`(清單 + 同名跨來源分組)、`favorites`、`marks`、`remoteProgress`、`format`、`types`。
- **`hooks/`** —— 可重用 stateful 邏輯 / 副作用:`useOtaUpdate`、`useOrientationLock`、`useKeepAwakeWhile`…(新嘅副作用/狀態邏輯放呢度,唔好塞 App)。
- **`components/`** —— 純展示元件(靠 props):`PlayerOverlay`、`RemotePanel`、`EpisodeGrid`、`TitleBar`、`AnimeRow`…
- **`storage/persist.ts`** —— 所有 AsyncStorage(key 集中喺 `K`,用 `getItem/setStr/setJSON/setFlag`);**唔好**周圍散 `AsyncStorage.*`。
- **`theme.ts`** 顏色 · **`styles.ts`** 共用 StyleSheet。
- 重大 feature / 重整行 **OpenSpec**(`openspec/changes/…` → 完成後 `openspec archive`,spec 入 `openspec/specs/`)。

## 重整 / 測試紀律
- **新 feature 連 unit test 一齊交**(純邏輯放 `lib/`,易 test)。`npm test`(jest-expo,見 `jest.config.js`)。
- Refactor = **純搬位、唔改行為**;改行為(清 catch、改 state 管理)另開清楚 commit。
- 每步 `tsc --noEmit` + `npm test` 要綠先 commit。
- **改行為相鄰**嘅嘢(動 hooks / state-ref 時序 / 直接掂 player / WS)風險高:`tsc` 驗唔到行為,**OTA 前必須喺手機 smoke test**(揀片→播、上下集、拖進度、遙控、設/清標記)。

# Deploying 改動：兩種節奏

OTA 而家用緊 **自架 server**(Cloudflare Worker `anime1-ota` + KV),`app.json` `updates.url = https://anime1-ota.eotw2054.workers.dev`,channel `production`,runtime 靜態 `"1.0.0"`。**EAS 保留做 backup**(見尾段)。

- **純 JS 改動**(`App.tsx`、`lib/*`、純 JS deps)→ 唔使 build APK:
  ```sh
  # 1. 改 app.json 嘅 expo.extra.releaseNotes(會喺 app 內「✨ 有新版本」提示顯示)
  # 2. 發佈（expo export → 計 hash → 上載 bundle/manifest 落 KV）：
  CLOUDFLARE_API_TOKEN=<token> node scripts/publish-ota.mjs
  #    或者 push master / GitHub Actions「Publish OTA」(.github/workflows/ota.yml) 自動跑
  ```
  手機開 app 自動 download,彈「✨ 有新版本」+「更新內容」→ 撳即時 reload。
  > ⚠️ 「更新內容」讀 `app.json` `expo.extra.releaseNotes`(跟 manifest 派落)。每次想 app 內見到新說明,就要先改 `releaseNotes` 再發佈。
  > storage = Cloudflare KV namespace `OTA`(`f5444f77…`);GitHub 寫入被 org 政策封,所以唔用 GitHub 存。

- **郁到 native**(加/升/拆 native module、改 `app.json` 嘅 `plugins`/權限/icon、升 `expo`/`react-native`)→ **手動 bump `app.json` 嘅 `runtimeVersion`**(例如 `"1.0.0"` → `"1.0.1"`),然後**重 build + 重新 sideload APK**,舊 APK 收唔到新 runtime 嘅 OTA:
  ```sh
  # 1. 改 app.json: "runtimeVersion": "1.0.1"
  npx expo prebuild -p android --clean   # /android 係 gitignored,由 app.json 生成
  & "$PWD\android\gradlew.bat" assembleRelease -p "$PWD\android"
  # → android/app/build/outputs/apk/release/app-release.apk，sideload + 可 copy 去 Z:\Project\AnimePlayer
  ```
  > ⚠️ `runtimeVersion` 用**靜態字串**,**唔好**用 `policy:"fingerprint"` —— 本機 gradlew build 同 server 計嘅 fingerprint 唔同,會令 OTA 永遠派唔到。靜態 runtime 保證 APK 同發佈一致。

OTA 只換 JS bundle,換唔到 native；`sync-worker/`(Cloudflare)係獨立,用佢自己嘅 `wrangler deploy`。

# OTA backup：切返 EAS

EAS 嘢全部保留(`expo-updates`、`extra.eas.projectId`、project `@eotw2054s-team/rn-app`)。自架壞咗想切返 EAS:
1. `app.json` `updates.url` 改返 `https://u.expo.dev/313eb4ec-182a-4cb3-82c2-97bf209ba6a6`
2. `npx expo prebuild -p android --clean` → `gradlew assembleRelease` → sideload
3. 發佈用 `npx eas-cli update --channel production --environment production -m "…"`

自架基建:`ota-worker/`(worker)、`scripts/publish-ota.mjs`(發佈)、`.github/workflows/ota.yml`(CI);KV namespace `OTA`;deploy worker 用 `CLOUDFLARE_API_TOKEN`(GitHub secret 已設)。

# 手機遙控投影機(SyncHub 遙控協定)

兩部機行同一個 app、登入**同一 cloud 帳號**,經 `sync-worker`(Worker `animeplayer-sync` + Durable Object `SyncHub`,**每個 user 一個 DO**)嘅 WebSocket relay 互相控制。「顯示」掣左邊有 per-device 角色 toggle **[ 播放器 │ 遙控器 ]**(`role`,AsyncStorage,預設 `player`):

- **播放器**(投影機):照常播片,**執行收到嘅 cmd**。
- **遙控器**(手機):player 區變遙控面板,**只送 cmd 唔執行**;喺手機 browse 揀片 → 投影機播。

```
遙控器 ──WS cmd──► SyncHub DO ──relay 去其他 socket──► 播放器(targetId==自己 → 執行)
播放器 ──WS state──► relay ──► 遙控器(now-playing + 進度條,本機推算)
```

## 角色 / roster / 授權邊界

- **裝置身份**:持久 `deviceId`(首次 `randomId()`)+ `deviceName`(預設 `Android-<4hex>`,上限 64 字)+ `role`。
- **roster** = DO 各 socket 嘅 `ws.serializeAttachment({deviceId,name,role})`(**hibernation-safe** 嘅 16KB 機制,唔計 SQLite rows;**唔好轉 KV-backed class**,靠 `wrangler.toml` `new_sqlite_classes=['SyncHub']` 留喺 free tier)。
- **授權邊界 = per-user DO**:同帳號**任何**登入裝置可控制**任何**播放器,冇 per-device pairing(個人/家用 app 明確接受嘅 trade-off)。
- **liveness 靠 roster + 心跳新鮮度,冇 per-command ack**:target 喺 roster 消失 / >6s 冇 `state` → 遙控面板報「連線中斷」。遙控面板要分清「**未登入**」vs「**未連接到播放器**」。

## WebSocket 訊息協定(client ↔ client,經 DO relay)

**每條 relay 訊息帶 `from:deviceId`**;DO **用 deviceId 排除 sender**(唔用物件 identity `s!==ws` —— hibernation 醒返唔保證)。未知 type 一律 **no-op**(同步路徑 `{type:'changed'}` 行同一條 socket)。

- `{ type:'hello', deviceId, name, role }` — 連線即送;DO `serializeAttachment` + broadcast roster 俾全部 + 直接回 roster 俾 newcomer(修 join race)。**角色變只重 send `hello`,唔 reconnect**。
- `{ type:'roster', devices:[{deviceId,name,role,playing?}] }` — DO 喺 connect/close/改角色時 broadcast。
- `{ type:'cmd', from, targetId, action, value? }` — `action`: `toggle | next | prev | seek | seekTo | fs | playEpisode`。
  - `seek` value=±10(秒);`seekTo` value=ratio(0..1);`playEpisode` value=`{ anime, url }`。
  - **執行條件**:`role==='player'` 且 `targetId===deviceId` 且 `from!==deviceId`。
- `{ type:'state', from, title, ep, position, duration, playing, hasPrev, hasNext, at }` — 播放器報 now-playing:事件(播/暫停/seek/換集)+ **~3s 心跳** broadcast。

### `playEpisode` payload(必須 pin 實)
`value.anime` 要係**完整 Anime**(夠 `favKey()`=`site`+`slug` 同 `resolveSource`/`parseEpisode` 用):`{ site, slug, title, num?, latestUrl?, cover? }`;`value.url` = 該集 episodeUrl。投影機收到 → `remotePlay(url, anime)` + 全螢幕。

## 進度條(順 + 慳,clock-skew 已處理)

- 收 `state` → 記 `{position, playing, recvAt = Date.now()}`,**用本機收到時間**(唔用 player 嘅 `at`,兩部 Android 時鐘 drift);`at` 只用嚟丟棄過期/亂序訊息。
- 每 0.5s tick:`顯示 = clamp(playing ? position + (now-recvAt)/1000 : position, 0, dur)`。
- 拖動:用 drag 值顯示 → 放手 send **一次** `seekTo(ratio)` + optimistic 設 position;**reconcile 窗 ~1.5s** 內忽略 incoming state,免被 seek 前心跳 snap 返。
- >6s(~2× 心跳)冇 state → freeze + 報「連線中斷」。

## 部署

- Worker:`cd sync-worker && wrangler deploy`(獨立於 OTA);client 純 JS,經自架 OTA 派,**runtime `1.0.1`**(兩部機要喺 1.0.1 APK 上先收到呢個 feature)。
- relay 係 in-memory `ws.send` fan-out,零 SQLite write;最壞 ~1 萬 inbound WS/日 ≈ free 額度 0.5%。
