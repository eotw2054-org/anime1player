## Why

而家每次改嘢(就算淨係改 `App.tsx` / `lib/` 嘅純 JS)都要行成個 native build + 重新 sideload APK:

```
改 App.tsx / sources / player UX
        │  (99% 改動都係純 JS)
        ▼
  gradlew assembleRelease   ← 慢、成個 native build
        ▼
  app-release.apk → 抄去 Z:\ → 手機重新安裝
```

絕大部分改動(睇 git history:sources、player UX、overlay、markers)全部都係 JS,根本唔使重 build native。加 **EAS Update (OTA)** 之後,JS 改動直接 push 上雲,手機自己 download,唔使再出 APK。

用戶已經喺另一個 sandbox project `eotw` 親手做過 OTA proof,證實條路行得通;呢個 change 係要將同一套機制正式接落 AnimePlayer。

## What Changes

裝 `expo-updates` + 接 EAS Update,並針對「自己 `gradlew` build、唔行 EAS Build」嘅情況手動處理 channel。

- 開一個**新** Expo project(slug `rn-app` / 顯示名 Anime1 Player),同 `eotw` sandbox 分開。
- `app.json` 加 `updates.url`、`updates.requestHeaders["expo-channel-name"] = "production"`、`runtimeVersion.policy = "fingerprint"`、`extra.eas.projectId`。
- Server 側 `eas channel:create production`。
- App 內加少少 code:開 app 自動 check + download update;有新版就**彈提示**,用戶撳一下即時 `reloadAsync()` 生效(唔使等下次開)。
- 重 build + sideload **一次**帶 `expo-updates` 嘅新 APK;之後日常用 `eas update --channel production`。

```
日常 JS 改動                          偶然郁 native
─────────────                        ──────────────
改 source / UI / 修 bug              加 native module / 升 expo
      ▼                                     ▼
 eas update --channel production       gradlew assembleRelease
      ▼ (秒級)                              ▼
 手機開 app 自動 download → 彈提示      sideload 重裝 + fingerprint 自動 bump
      ▼                                  runtimeVersion
 撳「更新」即時 reload 新版
```

## Design Decisions

1. **新 project,唔重用 `eotw`** — `eotw` 係測試 sandbox(已有 OTA proof + demo update 混雜),dashboard 嘅 update/usage 應該只屬 AnimePlayer。`eas init` 會起新 project 並填 `extra.eas.projectId`。

2. **`runtimeVersion.policy = "fingerprint"`** — 因為用戶自己 sideload、容易漏咗「郁 native 要 bump runtime」。fingerprint 會自動 detect 任何影響 native runtime 嘅改動(加 module / 改 plugins / 升 expo)而 bump,最唔會 push 新 JS 落舊 APK 而 crash。代價:郁 native 後一定要重 build(本來都要)。

3. **Channel 寫死喺 `requestHeaders`** — v56 文檔明確:唔行 EAS Build 時 channel 唔會自動 inject,要喺 app config 手動設 `expo-channel-name` request header,再 `eas channel:create` 喺 server 建立。單一 `production` channel,夠用、最簡單。

4. **In-app 更新 UX:提示 + 即時 reload** — 用 `expo-updates` API(`checkForUpdateAsync` → `fetchUpdateAsync` → 彈提示 → `reloadAsync`)。比起預設「靜靜雞下次開先生效」,用戶即時見到「有新版」並可即刻切換,feedback 清晰。只喺 production(非 `__DEV__`)行。

5. **繼續自己 `gradlew` + debug keystore,唔用 EAS Build** — EAS Update 同 EAS Build 係兩件事;只食 Update,build flow 維持現狀(memory `deploy-apk` 描述嗰套),只係由「每次」變成「偶然」。

## Out of Scope

- EAS Build(雲端出 APK)、Play Store 上架、code signing for updates。
- `preview` / staging channel(將來想要先加)。
- 多 runtime / rollback 自動化(用 dashboard 手動 republish 已足夠)。
