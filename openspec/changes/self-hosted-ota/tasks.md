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

- [ ] 3.1 `scripts/publish-ota.mjs`:`expo export -p android` → 每檔 `base64url(sha256)` → 砌 manifest(url 指 worker `/assets/<key>`)→ `wrangler kv key put` 上載 bundle/assets(metadata.contentType)+ `manifest:production:android:1.0.0` 落 KV
- [ ] 3.2 `.github/workflows/ota.yml`:push master / workflow_dispatch → run script(用 `CLOUDFLARE_API_TOKEN` secret)→ 上 KV;**唔寫 GitHub repo**(避開 org 政策)
- [ ] 3.3 確認 manifest `extra.expoClient.extra.releaseNotes` 由 app.json 帶入

## 4. App 接駁(可逆 cutover)

- [ ] 4.1 `app.json`:`updates.url` → worker URL(舊 `u.expo.dev` 留 comment 做 fallback)
- [ ] 4.2 `runtimeVersion "1.0.0"` 不變;`expo-updates` / projectId 不拆
- [ ] 4.3 `expo prebuild -p android --clean` → `gradlew assembleRelease` → sideload baseline + copy Z:

## 5. 驗證

- [ ] 5.1 worker 回正確 multipart manifest(curl 測 headers)
- [ ] 5.2 部機裝新 APK → push 一個自架 update → 彈「✨ 有新版本」+「更新內容」→ reload 生效
- [ ] 5.3 驗證 fallback:改返 `u.expo.dev` 重 build 仍 work(backup 證實)

## 6. 文檔

- [ ] 6.1 `AGENTS.md`:加自架發佈流程 +「切返 EAS backup」步驟
- [ ] 6.2 memory:記低自架 OTA 架構(worker URL、發佈、backup 切換)
