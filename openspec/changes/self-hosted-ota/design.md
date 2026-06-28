# Design — Self-hosted OTA (GitHub + minimal Cloudflare)

## 已確認嘅事實

| 項目 | 值 |
|---|---|
| Cloudflare account | `Eotw2054@gmail.com's Account`,ID `1a8d6d8aeba5b94cc79303d59fd10328` |
| CF API token | 已建立 + 驗證(scratchpad,Workers Scripts:Edit 等);GitHub secret `CLOUDFLARE_API_TOKEN` |
| 現有 worker | `animeplayer-sync`(獨立,唔郁) |
| GitHub repo | `eotw2054-org/anime1player`(master 已 sync) |
| EAS(保留 backup) | project `@eotw2054s-team/rn-app` id `313eb4ec-…`,`u.expo.dev` URL |
| runtimeVersion | 靜態 `"1.0.0"` |
| R2 / KV | **唔用**(R2 要卡;storage 放 GitHub) |

## 架構

```
┌── 發佈 (GitHub Action: push master 或 workflow_dispatch) ──┐
│  npx expo export -p android  → dist/                       │
│  Node script: 每個檔計 base64url(sha256),砌                │
│     updates/production/android/<runtimeVersion>/manifest.json │
│     (launchAsset + assets,url 指去 raw.githubusercontent)  │
│  commit dist/ + manifest 落 repo(branch: ota-dist)        │
└────────────────────────────────────────────────────────────┘
                          │ raw.githubusercontent.com/eotw2054-org/anime1player/ota-dist/...
                          ▼
┌── 派 (Cloudflare Worker `ota-worker`, stateless) ──────────┐
│  GET /  headers: expo-platform, expo-runtime-version,       │
│         expo-channel-name, expo-protocol-version:1          │
│  → fetch precomputed manifest.json from GitHub raw          │
│  → 若 runtime 唔 match → 204 No Update Available            │
│  → 包成 multipart/mixed (part name="manifest") 回           │
└────────────────────────────────────────────────────────────┘
                          ▼
            expo-updates (APK), updates.url = ota-worker
```

## Expo Updates protocol v1（worker 要回嘅嘢）

- Response `Content-Type: multipart/mixed; boundary=...`,一個 part `Content-Disposition: form-data; name="manifest"`,body 係 manifest JSON。
- Manifest JSON:
  ```jsonc
  {
    "id": "<uuid>",                       // 每次發佈唯一
    "createdAt": "<ISO8601>",
    "runtimeVersion": "1.0.0",
    "launchAsset": { "key","contentType":"application/javascript","url","hash" },
    "assets": [ { "key","contentType","url","hash" }, ... ],
    "metadata": {},
    "extra": { "expoClient": { ...app.json..., "extra": { "releaseNotes": "..." } } }
  }
  ```
- `hash` = **base64url(sha256(file))**;`key` = asset key;`url` = GitHub raw URL。
- `extra.expoClient` 要帶 app config(含 `extra.releaseNotes`)→ in-app「更新內容」照 work。
- 唔派時回 `204 No Update Available`(headers 帶 `expo-protocol-version`)。
- **唔簽名**:唔回 `expo-signature`,app 唔設 `codeSigningCertificate`。

## 檔案結構

```
ota-worker/
  wrangler.toml          # name=anime1-ota, account_id, vars: GITHUB_RAW_BASE
  src/index.ts           # protocol handler（讀 GitHub raw manifest → multipart）
scripts/
  publish-ota.mjs        # expo export → 計 hash → 砌 manifest → 寫 dist/
.github/workflows/
  ota.yml                # 手動/push 觸發:run publish-ota → commit ota-dist branch
```

## 風險 / 注意

1. **Hash 一致性** — 必須 `base64url(sha256)`,同 expo-updates 期望一致;Node `crypto` 計,publish 時做。
2. **`expoClient` 內容** — 要包含 `extra.releaseNotes` + `projectId` 等,由 `app.json` 讀入;否則 in-app notes / 行為走樣。
3. **GitHub raw 快取** — raw.githubusercontent 有 CDN cache(~5 分鐘);worker 可加 cache-bust query 或接受少少延遲。
4. **Cutover 可逆** — 改 `updates.url` 去 worker 要重 build APK;保留 `u.expo.dev` 註釋做 fallback。
5. **保留 EAS** — 唔拆 `expo-updates` / projectId / eas 流程。
6. **首個自架 APK 之前嘅安裝** — 舊 APK 指住 u.expo.dev,收唔到自架 OTA;要 sideload 一次新 APK(updates.url = worker)。
