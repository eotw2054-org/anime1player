# Design — EAS Update (OTA) for AnimePlayer

## 已確認嘅環境事實

| 項目 | 值 |
|---|---|
| Expo account | `eotw2054` |
| Team / owner slug | `@eotw2054s-team` |
| AnimePlayer app.json slug | `rn-app` |
| Android package | `com.yiu.anime1player` |
| Expo SDK | `~56.0.12` |
| Build 方式 | 自己 `gradlew assembleRelease` + Expo default **debug keystore** + sideload(**唔行 EAS Build**) |
| Sandbox 證明 | `eotw` project 已有 2 個 OTA update(branch `preview`)= OTA 機制證實可行 |

## 核心約束:OTA 只更新 JS,唔更新 native

```
┌──────────── 一個 APK(native 殼)─────────────┐
│  expo runtime + expo-video / keep-awake /     │   ← 只能靠重 build + sideload 換
│  async-storage / picker / RN core             │
│  ┌──────────── JS bundle ────────────────┐    │
│  │  App.tsx / lib/*.ts / 純 JS deps       │    │   ← EAS Update OTA 換呢層
│  └────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
        runtimeVersion 夾住「邊個 JS 配邊個殼」
```

`runtimeVersion` 一錯配,新 JS 會去 call 一個舊 APK 冇嘅 native module → crash。fingerprint policy 就係自動維護呢個配對。

## Config:`app.json`(本機 build 版本)

```jsonc
{
  "expo": {
    // ...existing...
    "runtimeVersion": "1.0.0",   // 靜態 — fingerprint policy 對本機 build 唔可靠(見下)
    "updates": {
      "url": "https://u.expo.dev/<projectId by eas init>",
      "requestHeaders": { "expo-channel-name": "production" }
    },
    "extra": { "eas": { "projectId": "<by eas init>" } }
  }
}
```

- `requestHeaders.expo-channel-name` 係**非-EAS-Build** 揀 channel 嘅唯一方法(v56 文檔)。EAS Build 用戶係靠 `eas.json` build profile 嘅 `channel`,我哋唔行嗰條路。
- `eas update:configure` 會順手寫 `android/app/src/main/AndroidManifest.xml` 嘅 `expo.modules.updates.*` meta-data。要 confirm 佢冇搞亂現有 manifest。

## In-app 更新流程(production only)

```
app 啟動 / 返到前景
      │
      ▼  __DEV__ ? → 跳過(dev 用 metro,唔好 OTA)
 Updates.checkForUpdateAsync()
      │ isAvailable?
      ├─ no  → 乜都唔做
      └─ yes → Updates.fetchUpdateAsync()
                    │ isNew?
                    └─ yes → 彈提示「有新版本」[更新][遲啲]
                                  │
                          撳[更新] → Updates.reloadAsync()  (即時切換)
```

- 用 `expo-updates` 嘅 `useUpdates()` hook 或直接 call API。提示用現有 UI pattern(App.tsx 已有 overlay / modal 風格)。
- `reloadAsync()` 會載入啱啱 fetch 落嘅新 bundle,即時生效。
- 失敗(冇網 / fetch error)要 try/catch 靜默,唔好阻住正常用 app。

## ⚠️ 為何唔用 fingerprint policy(實測踩過嘅雷)

原本揀 `policy:"fingerprint"`,部署後部機**完全收唔到 OTA**。Multi-agent RCA 拆 APK 證實:

```
本機 gradlew build 燒入 assets/fingerprint = 47b0d15c03989a925671fa52caa8824202511501
eas update CLI 計嘅 runtime version       = 702eac7fb0f47d0d88d4bf37fc86350e385b22a3
                  ↑ 兩個唔同 → u.expo.dev 當「呢個 runtime 無 update」→ 永遠唔派
```

`fingerprint` policy 喺「本機 build」同「eas CLI」用唔同輸入計 hash,結果分歧 → 換 **靜態 `runtimeVersion: "1.0.0"`**(兩邊用同一字面值,保證一致)。

## Runtime version 嘅後果(要記住)

凡改到 native(以下任何一樣)→ **手動 bump `runtimeVersion`(如 `"1.0.1"`)+ 重 build + 重新 sideload APK**,舊 APK 收唔到新 runtime 嘅 OTA:

- `package.json` 加/升/拆任何 **native** dependency
- `app.json` 改 `plugins`(而家得 `expo-video`)、權限、package、icon plugin 等
- 升 `expo` / `react-native`

純 JS 改動(App.tsx、lib/*、純 JS npm package)→ runtimeVersion 不變 → 照 OTA。

## 風險 / 未知數(部署後狀態)

1. ✅ **`/android` 係 gitignored(CNG)** — 用 `expo prebuild -p android --clean` 重新生成,native config 由 app.json 驅動,冇 clobber 問題。
2. ✅ **舊安裝收唔到 OTA** — 已 sideload 帶 expo-updates + runtime `1.0.0` 嘅新 APK 做 baseline。
3. ✅ **debug keystore 唔影響 update 收取** — update 行 runtimeVersion + channel + projectId,同簽名無關。
4. ⚠️ **靜態 runtime 要記得手動 bump** — 郁 native 唔 bump 嘅話,新 JS 會 push 落舊 native crash;已喺 `AGENTS.md` 寫低雙節奏。
