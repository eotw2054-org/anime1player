# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

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
