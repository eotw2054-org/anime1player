## 1. openAnime 切換邏輯

- [x] 1.1 移除 `prog?.url` gate 同 `roleRef.current !== 'remote'` gate,改按 `roleRef.current` 分支
- [x] 1.2 有紀錄:`player` → `resumeAtRef.current = prog.time||0` + `playEpisode(prog.url, a)`;`remote` → `remotePlay(prog.url, a)`(eager,唔等 fetch)
- [x] 1.3 冇紀錄:target url = 有 `a.num` 用 `buildChapters(a.site,a.slug,a.num)[0].url`(同步);冇 `a.num` 用 `await fetchHtml` 攞嘅 `out[0].url`(空 fallback `a.latestUrl`)。**唔排序、唔搵真 ep1**
- [x] 1.4 冇紀錄:`player` → `resumeAtRef.current = null` + `playEpisode(targetUrl, a)`;`remote` → `remotePlay(targetUrl, a)`
- [x] 1.5 有紀錄分支播完仍要 fall through 去現有 `setChapters`/`fetchHtml` 砌集數格(唔好即 `return`)

## 2. 遙控

- [x] 2.1 `remotePlay`(L1288)讀 `targetIdRef.current` 砌 payload + `== null` 就 no-op;cmd 維持 `{url, anime}`,唔帶 resumeAt

## 3. 驗證

- [x] 3.1 `npx tsc --noEmit` pass
- [ ] 3.2 Manual(本機):揀有紀錄片 → resume 上次集;揀從未播片 → 即播(由 source 第一個 url),舊片唔殘留
- [ ] 3.3 Manual(遙控):撳一套 → 投影機切去同一 url;未鎖定 target(0/≥2 player)→ no-op,唔會所有 player 一齊播
- [ ] 3.4 Regression:撳「集」、auto-advance、prev/next、繼續觀看 行為不變

## 4. 部署

- [x] 4.1 OTA 發佈:改 `app.json` `releaseNotes` + push master 觸發「Publish OTA」Action(`.github/workflows/ota.yml`)
- [x] 4.2 跟 memory 規矩:branch `feat/switch-anime-follows-selection` + review → `--no-ff` merge master + push(`5784154..3c9760b`)
