# Anime1 Player → React Native (Expo) App 計劃書（由 0 開始）

目標：用 **React Native + Expo** 由零重寫 `20260621.html` 成原生 Android App。
- **冇 CORS**（RN 嘅 fetch 行原生網絡，唔受瀏覽器限制）→ 唔使擴充、唔使代理
- **HLS 播放用 `expo-video`（底層 ExoPlayer）**，原生硬解，最穩
- **用 EAS 雲端 build APK** → 電腦只需 Node，**唔使裝 Android Studio**

App 資料：
- 名稱：`Anime1 Player`，package：`com.yiu.anime1player`，最低 Android 8（API 26）

---

## 技術選型

| 範疇 | 用咩 |
|------|------|
| 框架 | Expo（managed）+ expo-router（檔案式導航） |
| 影片 | `expo-video`（HLS / mp4 原生播放、跳秒、全螢幕） |
| 網頁抓取 | `fetch`（原生）+ `node-html-parser`（純 JS 解析，無需 DOM） |
| 本地儲存 | `@react-native-async-storage/async-storage`（記住網站選擇、跳秒） |
| 下拉/選擇 | `@react-native-picker/picker`（網站切換） |
| Build | **EAS Build（雲端）** → 出 APK，無需本機 Android SDK |

---

## Phase 0 — 現況

- Node ✅ v22.16.0（Expo 要 ≥18）
- 現成 HTML 嘅**邏輯可重用做藍本**（抓列表、產生集數、解析影片源），但 UI 要重寫成 RN component。

---

## Phase 1 — 工具鏈（由 0，最精簡，唔使 Android Studio）

```powershell
# 1. EAS CLI（雲端 build 工具）
npm install -g eas-cli
# 2. 開個免費 Expo 帳號
eas login        # 冇帳號就去 https://expo.dev 免費註冊
```
> 就咁多。**唔使 JDK / Android SDK / Android Studio** —— build 喺 Expo 雲端做。
> （可選：日後想本機 emulator 快速測試，先補裝 Android Studio，見 Phase 8。）

---

## Phase 2 — 建立 Expo 專案 + 安裝依賴

```powershell
cd z:\Yiu\Anime1-player
npx create-expo-app@latest rn-app
cd rn-app
npx expo install expo-video node-html-parser @react-native-async-storage/async-storage @react-native-picker/picker
```

設定 app.json（重點）：
```jsonc
{
  "expo": {
    "name": "Anime1 Player",
    "slug": "anime1-player",
    "android": { "package": "com.yiu.anime1player" },
    "plugins": ["expo-router", "expo-video"]
  }
}
```

---

## Phase 3 — 資料層（純 TS module，可離線寫＋測試）

建立 `lib/anime1.ts`，把現成 HTML 嘅邏輯移植做純函數：

```ts
export const SITES = {
  in:  "https://anime1.in",
  one: "https://anime1.one",
};

export async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await r.text();              // 原生 fetch，無 CORS
}

// 解析首頁 TablePress 列表 → 動畫陣列（含更新年份、集數）
export function parseHomeList(html: string): Anime[] { /* node-html-parser 解析 #tablepress-1 tbody tr */ }

// 由集數數量直接砌每集網址：code = 10 + pad3(i) + 000
export function buildChapters(site: string, slug: string, count: number): string[] { /* … */ }

// 集數頁 → vframe iframe → 深入解析出 .m3u8 / .mp4（移植 fetchVideoSourceDeep）
export async function resolveSource(site: string, episodeUrl: string): Promise<string|null> { /* … */ }
```

> 呢層係**核心、可重用**。我會直接由你現有 HTML 嗰幾個函數（`parseHomeList`、
> 集數產生、`fetchVideoSourceDeep`、`buildPrevEpisodeUrl`）逐個移植，邏輯已驗證過。

---

## Phase 4 — UI（expo-router 三個畫面）

```
app/
  index.tsx        → 動畫列表（網站切換 Picker + 搜尋 + 按更新年份分 SectionList）
  [slug].tsx       → 集數列表（集數掣 grid）
  play.tsx         → 播放器（expo-video：HLS、跳秒、全螢幕、上/下一集）
lib/anime1.ts      → Phase 3 資料層
```

重點對應（HTML → RN）：
| HTML | RN |
|------|----|
| 網站下拉 + localStorage | `<Picker>` + AsyncStorage |
| 搜尋 input + 分組清單 | `<TextInput>` + `<SectionList>`（section = 更新年份） |
| 集數掣 | `<FlatList numColumns>` of `<Pressable>` |
| `<video>` + hls.js | `<VideoView>`（expo-video，`source={{uri}}`，HLS 原生） |
| 跳過秒數 | player `currentTime = skip`（onReady） |
| 全螢幕 | expo-video 內建 fullscreen |
| 上/下一集 | 由集數網址計（移植 `buildPrevEpisodeUrl` / 下一集連結） |

---

## Phase 5 — EAS 雲端 Build APK（無需 Android Studio）

```powershell
eas build:configure
# eas.json 加一個出 APK 的 profile：
#   "preview": { "android": { "buildType": "apk" } }
eas build -p android --profile preview
```
- 上傳 → 雲端 build（約 10–20 分鐘）→ 完成畀你一條**下載連結**
- 載 APK 落電腦/手機

---

## Phase 6 — 安裝落投影機

- 將 APK 傳去投影機（USB手指 / 雲端 / `adb install`）
- 允許「安裝未知來源」→ 安裝 → 桌面出現 **Anime1 Player**

---

## Phase 7 — 驗證 & 故障排除

驗證：
1. 開 App → 列表載入（證明原生 fetch 撈到、CORS 已消失）
2. 切 anime1.in / anime1.one
3. 撳動畫 → 集數 → **片播得到**（expo-video HLS）

可能要處理：
- **影片源解析**：個別站把 m3u8 藏喺 player 頁的 JS，`resolveSource` 可能要加 regex 規則（同 HTML 版一樣逐步加）。
- **expo-video HLS**：Android ExoPlayer 原生支援 `.m3u8`，正常直接播；若某 CDN 查 Referer，fetch 解析階段照樣帶 UA/Referer。
- **跳秒時機**：用 `player.addListener('statusChange')` 或 onReady 後 seek。

---

## Phase 8（可選）— 加速本機測試 / 正式版

- **快速 iteration**：裝 Android Studio（emulator）或用 `eas build --profile development` 出 dev build 裝落實機，配 `npx expo start` 熱更新。
- **正式簽名版**：`eas build -p android --profile production`（EAS 自動管理 keystore）。

---

## 時間 / 成本

| Phase | 時間 | 一次性？ |
|-------|------|---------|
| 1 工具鏈 | 10 分鐘（裝 eas-cli + 註冊） | 一次過 |
| 2 建專案+依賴 | 10 分鐘 | 一次過 |
| 3 資料層移植 | 1–2 鐘頭（我做） | 一次過 |
| 4 UI | 2–4 鐘頭（我做） | 一次過 |
| 5 EAS build | 每次 10–20 分鐘（雲端跑，你等） | 每次更新 |
| 6 安裝 | 5 分鐘 | 每次更新 |
| 7 驗證/排錯 | 視乎播放 | — |

費用：**$0**（Expo / EAS 免費額度足夠個人用）。
**全程唔使本機 Android Studio**（除非想 Phase 8 加速測試）。

---

## 同 Capacitor 版嘅分別（記錄）

- Capacitor = 包住現成 HTML，幾乎唔使改，但要 Android Studio、HLS 靠 WebView。
- React Native = 重寫，但 CORS 天生冇、HLS 原生最穩、可雲端 build 免 Android Studio。
- 已選：**React Native (Expo)**。
