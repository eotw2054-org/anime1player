## 1. Cloudflare 準備(已完成)

- [x] 1.1 確認可用服務:Workers + KV(免費);R2 要卡 → 棄。GitHub 寫入被 org 政策封 → storage 改用 **KV**
- [x] 1.2 建立 + 驗證 CF API token(wrangler deploy 用;scratchpad + GitHub secret `CLOUDFLARE_API_TOKEN`)
- [x] 1.3 Account ID `1a8d6d8aeba5b94cc79303d59fd10328`
- [x] 1.4 建立 KV namespace `OTA`(id `f5444f7783374419abf63bca3296b54b`)

## 2. OTA Worker(manifest endpoint)

- [x] 2.1 `ota-worker/`:`wrangler.toml`(name `anime1-ota`、account_id、KV binding `OTA`)
- [x] 2.2 `src/index.ts`:manifest 由 KV(`manifest:<ch>:<plat>:<rt>`)→ multipart;`/assets/<key>` 由 KV 派 binary;唔 match → 204
- [x] 2.3 live 測試:health 200、204、**KV roundtrip**(put manifest → 回 multipart 200)✅
- [x] 2.4 deploy(KV binding)→ URL **`https://anime1-ota.eotw2054.workers.dev`**

## 3. 發佈 pipeline

- [x] 3.1 `scripts/publish-ota.mjs`:`expo export` → `base64url(sha256)` → 砌 manifest(url 指 worker `/assets/<hash>.<ext>`)→ `wrangler kv key put` 上 KV;content-type 由 key 副檔名推斷(worker 端)
- [x] 3.2 `.github/workflows/ota.yml`:push master / dispatch → run script(`CLOUDFLARE_API_TOKEN` secret)→ 上 KV;`permissions: contents:read`(唔寫 repo)
- [x] 3.3 manifest `extra.expoClient.extra.releaseNotes` 已驗證帶入(curl 睇到)

## 4. App 接駁(可逆 cutover)

- [x] 4.1 `app.json`:`updates.url` → `https://anime1-ota.eotw2054.workers.dev`(EAS url 寫入 AGENTS.md fallback)
- [x] 4.2 `runtimeVersion "1.0.0"` 不變;`expo-updates` / `extra.eas.projectId` 不拆
- [x] 4.3 `prebuild --clean` → `gradlew assembleRelease`(manifest URL 確認)→ APK copy Z:;**sideload 要部機**

## 5. 驗證

- [x] 5.1 worker 端到端:manifest 200 multipart + bundle 200(application/javascript, 2.1MB)由 KV 派 ✅
- [ ] 5.2 **【要你部機】** 裝新 APK → 開 app 彈「✨ 有新版本」+「更新內容」→ reload 生效
- [ ] 5.3 (可選)驗 fallback:改返 `u.expo.dev` 重 build 仍 work(步驟已寫 AGENTS.md)

## 6. 文檔

- [x] 6.1 `AGENTS.md`:自架發佈流程 +「切返 EAS backup」步驟
- [x] 6.2 memory `self-hosted-ota`:架構 / 發佈 / backup 切換
