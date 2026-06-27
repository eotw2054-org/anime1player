# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Deploying 改動：兩種節奏

呢個 app 用緊 **EAS Update (OTA)**(project `@eotw2054s-team/rn-app`,channel `production`)。

- **純 JS 改動**(`App.tsx`、`lib/*`、純 JS deps)→ 唔使 build APK:
  ```sh
  npx eas-cli update --channel production -m "說明"
  ```
  手機開 app 自動 download,彈「✨ 有新版本」→ 撳即時 reload。

- **郁到 native**(加/升/拆 native module、改 `app.json` 嘅 `plugins`/權限/icon、升 `expo`/`react-native`)→ **手動 bump `app.json` 嘅 `runtimeVersion`**(例如 `"1.0.0"` → `"1.0.1"`),然後**重 build + 重新 sideload APK**,舊 APK 收唔到新 runtime 嘅 OTA:
  ```sh
  # 1. 改 app.json: "runtimeVersion": "1.0.1"
  npx expo prebuild -p android --clean   # /android 係 gitignored,由 app.json 生成
  & "$PWD\android\gradlew.bat" assembleRelease -p "$PWD\android"
  # → android/app/build/outputs/apk/release/app-release.apk，sideload + 可 copy 去 Z:\Project\AnimePlayer
  ```
  > ⚠️ `runtimeVersion` 用**靜態字串**,**唔好**用 `policy:"fingerprint"` —— 本機 gradlew build 同 `eas update` CLI 計嘅 fingerprint 唔同,會令 OTA 永遠派唔到。`eas update` 會自動用 app.json 嗰個靜態 runtime,同 APK 一致。

OTA 只換 JS bundle,換唔到 native；`sync-worker/`(Cloudflare)係獨立,用佢自己嘅 `wrangler deploy`。
