# Anime1 Player（React Native / Expo Android App）

由 `20260621.html` 重寫成原生 Android App。
- **無 CORS**：用原生 `fetch` 撈 anime1.in / anime1.one（唔使瀏覽器擴充、唔使代理、唔使開電腦）
- **HLS 播放**：`expo-video`（ExoPlayer）原生播 `.m3u8`
- **功能**：動畫列表（按更新年份分組 + 搜尋）、網站切換、集數、播放、上/下一集、跳秒、切換來源

> 資料層已實測：兩個站都能列表 → 集數 → 解析出真實 m3u8 影片源。

---

## 資料夾結構（self-contained）

```
rn-app/
├── App.tsx                ← UI（列表 / 集數 / 播放器）
├── lib/anime1.ts          ← 資料層（抓列表、產生集數、解析影片源）
├── index.ts               ← 入口（已載入 url-polyfill）
├── app.json               ← App 設定（名稱、package=com.yiu.anime1player）
├── android/               ← 已 prebuild 的原生專案 → 用 Android Studio 開呢個 build APK
├── docs/
│   ├── PLAN.md            ← 完整計劃書
│   └── reference-player.html ← 原本的 HTML 版（參考用）
├── package.json
└── README.md              ← 本檔
```

---

## 在「裝咗 Android Studio 嘅電腦」上 Build APK

### 前置
- **Android Studio**（內含 Android SDK + JDK 17/21）
- **Node.js ≥ 18**

### 步驟

1. **將成個 `rn-app/` 資料夾搬去 build 電腦**
   ⚠️ 唔好連 `node_modules` 一齊 copy（太大、易壞）。Copy 其餘檔案後，喺 build 電腦行：
   ```
   cd rn-app
   npm install
   ```
   > 若 copy 時冇 `android/` 或想重新生成：`npx expo prebuild -p android`
   > （注意：重新 prebuild 會覆蓋 `android/AndroidManifest.xml`，要再加返
   >  `android:usesCleartextTraffic="true"`，見下方故障排除。）

2. **Build APK（任選一）**

   **方法 A — Android Studio（圖形介面）**
   - 開 Android Studio → Open → 揀 `rn-app/android` 資料夾
   - 等 Gradle sync 完
   - 選單 **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
   - 完成後撳通知的 **locate** → 得到 `app-debug.apk`

   **方法 B — 指令**
   ```
   cd rn-app/android
   ./gradlew assembleDebug        # Windows: .\gradlew assembleDebug
   ```
   APK 位置：`rn-app/android/app/build/outputs/apk/debug/app-debug.apk`

   > 若 `JAVA_HOME` 指向太新的 JDK（如 24），Gradle 會失敗。
   > 用 Android Studio 內附的 JDK：`File → Settings → Build Tools → Gradle → Gradle JDK` 揀 **jbr-17/21**；
   > 或設 `JAVA_HOME` 去 `...\Android Studio\jbr`。

---

## 安裝落投影機

- **USB**：`adb install -r app-debug.apk`（投影機開「開發者選項 → USB 偵錯」）
- **手動**：將 `app-debug.apk` 傳去投影機 → 檔案管理員開啟 → 允許「安裝未知來源」→ 安裝

裝完桌面有 **Anime1 Player**，開 App 即用。

---

## 故障排除

| 問題 | 處理 |
|------|------|
| 列表載入唔到 | 確認投影機有網絡；換網站（anime1.in ↔ anime1.one）試 |
| 某集片播唔到 | 撳播放器下方「切換來源」(Main / 分流) 試其他來源 |
| 片段係 HTTP 播唔到 | 已在 `AndroidManifest.xml` 開 `android:usesCleartextTraffic="true"`；若重新 prebuild 後消失，手動加返落 `<application>` tag |
| Gradle JDK 版本錯 | 見上方「方法 B」JDK 說明 |
| 影片 CDN 查 Referer | 資料層／播放器已帶 `Referer`＝當前網站；如某 CDN 仍擋，要按該源調整 header |

---

## 更新 App（改完之後）

1. 改 `App.tsx` 或 `lib/anime1.ts`
2. `npx expo prebuild -p android`（若改咗原生設定才需要；純 JS 改動可略過）
3. 重新 `./gradlew assembleDebug` → 出新 APK → 重新安裝

---

## 備用：EAS 雲端 Build（唔想用本機 Android Studio 時）

```
npm install -g eas-cli
eas login                       # 免費 Expo 帳號
eas build:configure
eas build -p android --profile preview   # 雲端 build，完成畀下載連結
```
免費 tier 夠個人用（有每月上限 + 排隊）。
