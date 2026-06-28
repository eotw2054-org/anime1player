## Why

而家 OTA 用緊 **EAS Update**(Expo hosted,`u.expo.dev`,Expo account `eotw2054s-team`)。用戶想**脫離 Expo 嘅 OTA 服務**,改為**自架喺自己嘅 GitHub + Cloudflare**(同 `sync-worker` / Turso 一樣 self-host 風格),但**保留 EAS 做 backup**。

關鍵:`expo-updates`(client library)兩邊共用 —— 自架只係將佢個 `updates.url` 由 `u.expo.dev` 指去自己嘅 Worker。所以「保留 Expo」幾乎免費:唔拆 library、唔拆 EAS config,cutover 可逆。

## What Changes

```
expo-updates (APK 內)
   updates.url ──┬─ https://u.expo.dev/...        (EAS,保留做 backup)
                 └─ https://<ota-worker>.workers.dev  (自架,新)
```

- **發佈**(GitHub Action,push 或手動):`npx expo export -p android` → 計每個檔 sha256 → 砌 manifest(URL 指 worker `/assets/<key>`)→ `wrangler` 將 bundle/assets/manifest 上載落 **KV**(用 `CLOUDFLARE_API_TOKEN`)。**唔寫 GitHub repo**。
- **派俾 app**(Cloudflare Worker `anime1-ota`):收 app 請求(headers:`expo-platform` / `expo-runtime-version` / `expo-channel-name`)→ 由 **KV** 攞 manifest → 包 `multipart/mixed` 回;`/assets/<key>` 由 KV 派 bundle/asset。
- **App**:`app.json` `updates.url` 改去 worker(可逆;舊 URL 註明 fallback);`runtimeVersion "1.0.0"` 照舊;**重 build + sideload 一次**(URL 燒喺 native)。
- **保留 EAS**:`expo-updates`、`projectId`、舊 `u.expo.dev` URL、`eas update` 流程全部留低,`AGENTS.md` 註明點切返。

## Design Decisions

1. **Cloudflare KV 存 bundle/assets/manifest(由 GitHub 改成 KV)** — 原本想 GitHub raw 存,但 org 政策鎖死咗 CI 寫入 GitHub(read-write token 同 deploy key 都封),要郁 org-wide 設定。改用 **KV**:免費、免卡(R2 先要卡)、每 value 25MB(bundle ~2MB 綽綽有餘),publish 用已有嘅 `CLOUDFLARE_API_TOKEN` 上載,**完全唔使掂 GitHub 政策**。Worker 由 KV 派 manifest + `/assets/<key>` 派 bundle/asset。

2. **Hash 喺發佈時(GitHub Action / Node)計,唔喺 Worker 計** — expo-updates 要每個 asset 嘅 `base64url(sha256)`,而 `expo export` 嘅 metadata.json 唔含 hash。Action 用 Node 計好、寫入 precomputed manifest;Worker 只讀 + 包 multipart,保持 stateless + 快。

3. **唔做 code signing**(私人 app、自己 sideload) — 唔設 `codeSigningCertificate` / `expo-expect-signature`,worker 唔使簽,最簡單。日後想加可以後補。

4. **保留 EAS 做 backup,cutover 可逆** — 唔拆任何 EAS / expo-updates 嘢;切換純粹係改 `updates.url` + 重 build。自架壞咗就改返 `u.expo.dev` 重 build。

5. **`runtimeVersion` 維持靜態 `"1.0.0"`** — 同 APK 一致(之前已驗證 fingerprint policy 對本機 build 唔可靠)。worker 按 runtime 比對先派。

6. **Channel 概念保留** — worker 按 `expo-channel-name` header(`production`)揀 manifest,同 EAS 行為一致。

## Out of Scope

- Code signing / rollback 自動化 / staging channel(將來)。
- iOS(只搞 android,同現狀一致)。
- 即時拆走 EAS(明確保留做 backup)。
