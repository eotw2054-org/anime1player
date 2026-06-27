## 1. 安裝同 link(一次性)

- [x] 1.1 `npx expo install expo-updates`(裝同 SDK 56 夾嘅版本)
- [x] 1.2 確認 `eas-cli` 已裝 + `eas login`(account `eotw2054`)— CLI 已登入 `eotw2054`(`~/.expo/state.json`)
- [x] 1.3 `eas init` → 起**新** project `@eotw2054s-team/rn-app`(ID `313eb4ec-182a-4cb3-82c2-97bf209ba6a6`),自動寫 `extra.eas.projectId`
- [x] 1.4 `eas update:configure` → 寫 `updates.url` + runtimeVersion(後改 fingerprint)
- [x] 1.5 發現 `/android` `/ios` 係 **gitignored(CNG)**,native 由 app.json prebuild 生成 → 改用 `expo prebuild -p android --clean` 重新生成,manifest 自動 enable + 寫 URL/channel/runtime(比手動改 manifest 乾淨、唔會被下次 prebuild 冚走)

## 2. Config(本機 build 專用)

- [x] 2.1 `app.json`:`runtimeVersion` = `{ "policy": "fingerprint" }`(已由 appVersion 改返 fingerprint)
- [x] 2.2 `app.json`:`updates.requestHeaders` = `{ "expo-channel-name": "production" }` → manifest `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` 已燒入
- [x] 2.3 `updates.url` = `https://u.expo.dev/313eb4ec-182a-4cb3-82c2-97bf209ba6a6` ✅
- [x] 2.4 `eas channel:create production`(channel + branch `production` 已建立)

## 3. In-app 更新 UX(production only)

- [x] 3.1 App 啟動 `if (!__DEV__)` 行 `Updates.checkForUpdateAsync()`(App.tsx OTA effect)
- [x] 3.2 有 update → `Updates.fetchUpdateAsync()`;`isNew` 先 `setUpdateReady(true)`
- [x] 3.3 提示 UI `updateModal`(沿用 `syncCard`/`syncBtn` style):「✨ 有新版本」+ [立即更新]/[遲啲]
- [x] 3.4 撳[立即更新] → `applyUpdate()` → `Updates.reloadAsync()`
- [x] 3.5 全程 try/catch 靜默(冇網 / 失敗唔阻住用 app)
- [x] 3.6 返到前景(`AppState` `active`)時再 check 一次

## 4. Baseline build(一次性)

- [x] 4.1 `gradlew assembleRelease` → `app-release.apk`(73.6 MB,帶 expo-updates)
- [ ] 4.2 **【要你部機】** Sideload 安裝呢個新 APK 做 baseline(舊 APK 收唔到 OTA)
- [x] 4.3 copy 去 `Z:\Project\AnimePlayer\app-release.apk`

## 5. 驗證 OTA 真係 work

- [x] 5.1 改用「publish 現有 code 做初始 baseline」取代改測試字串
- [x] 5.2 `eas update --channel production --environment production`(android runtime `702eac7f…`,group `fd9c9c55…`)
- [ ] 5.3 **【要你部機】** baseline APK 開 app → fetch + 彈「✨ 有新版本」→ 撳更新 reload(要再 push 第 2 個 update 先見到變化)
- [x] 5.4 dashboard `production` channel/branch 已有 update group(publish 成功)
- [ ] 5.5 **【要你部機】** 驗證後再 push 正常版(日常用 `eas update --channel production -m "…"`)

## 6. 文檔 / memory

- [x] 6.1 `AGENTS.md` 加「Deploying 改動:兩種節奏」section(日常 `eas update`;郁 native 先 prebuild+gradlew)
- [x] 6.2 memory `deploy-apk` 補 OTA flow + gitignored android + 幾時要重 build(fingerprint 變)
