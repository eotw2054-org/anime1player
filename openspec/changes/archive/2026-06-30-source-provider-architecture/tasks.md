## 1. 階段 0 —— 定合約(零行為)

- [x] 1.1 新增 `lib/sources/types.ts`:`SourceProvider` interface(含 optional `adDetector`)+ `PlayLine = { label: string; episodes: Chapter[] }`,re-export 現有 `Anime`/`Chapter`/`EpisodeInfo`/`Stream`/`AdRange`
- [x] 1.2 `npx tsc --noEmit` pass

## 2. 階段 1 —— 包 anime1(純搬)

- [x] 2.1 新增 `lib/sources/anime1.ts`:`anime1Provider: SourceProvider`,`id:'anime1'`、`label:'anime1'`
- [x] 2.2 `loadCatalog()` 封裝 `fetchHtml(SITES[...]) + parseHomeList`(暫時針對單一站,鏡像合併仍由 App 控)
- [x] 2.3 `getEpisodes(a)` 封裝現有兩條路(`a.num` → `buildChapters`;否則 fetch 詳情頁 regex,空 fallback `latestUrl`),回**單一線路** `[{ label:'預設', episodes }]`
- [x] 2.4 `getEpisode(url)` = `parseEpisode(url)`;`resolveStream(embedUrl)` = `resolveSource(embedUrl)`
- [x] 2.4b `adDetector(m3u8Url, headers)` = `getAdRanges(m3u8Url, headers)`(包 `lib/adskip.ts`,純搬)
- [x] 2.5 `lib/anime1.ts` 純函數 + `anime1.test.ts` 維持不變、繼續綠
- [x] 2.6 為 provider 包裝層加 unit test(`getEpisodes` 單線路形狀、`a.num` 快速路徑)
- [x] 2.7 `npx tsc --noEmit` + `npm test` pass

## 3. 階段 2 —— 登記處

- [x] 3.1 新增 `lib/sources/registry.ts`:`providers = { anime1: anime1Provider }` + `getProvider(a: Anime)`(用 `a.site` 比對,fallback `anime1Provider`)
- [x] 3.2 unit test:anime1 域名 → `anime1Provider`;未知 → fallback
- [x] 3.3 `npx tsc --noEmit` + `npm test` pass

## 4. 階段 3 —— 接線 App.tsx（風險最高）

- [x] 4.1 `loadList` 改用 `getProvider(...).loadCatalog()`(鏡像 loop 仍喺 App)
- [x] 4.2 `openAnime` 改用 `getProvider(a).getEpisodes(a)`,取 `lines[0].episodes` 砌 `chapters`(UI 暫時單線路,行為不變)
- [x] 4.3 `playEpisode` 改用 `getProvider(anime).getEpisode(url)`
- [x] 4.4 `loadStream` 改用 `getProvider(...).resolveStream(embedUrl)`;`isPlayable` 維持共用 util
- [x] 4.4b play 路徑(App.tsx:662 附近)改成 `provider.adDetector ? provider.adDetector(src, headers) : Promise.resolve([])`;唔再直接 import `getAdRanges`
- [x] 4.5 移除 `App.tsx` 對 `lib/anime1.ts` 嘅直接 function import(只經 registry);`import type { Anime }` 等型別保留
- [x] 4.6 `npx tsc --noEmit` + `npm test` pass

## 5. 驗證（接線階段必做）

- [x] 5.1 Manual(本機):揀有紀錄片 → resume;揀未播片 → 即播;上一集/下一集;拖進度
- [x] 5.2 Manual:切換集層分流(多播放器)正常;自動最佳片源探測不變
- [x] 5.3 Manual(遙控):遙控器揀片 → 投影機播;now-playing/進度條正常
- [x] 5.4 Manual:設/清片頭片尾標記;收藏/取消收藏 + sync 正常(favKey 不變)
- [x] 5.5 Regression:三鏡像(in/one/cc)清單合併、去重、搜尋、年份分組行為不變

## 6. 部署

- [x] 6.1 跟 memory 規矩:branch `refactor/source-provider-architecture` + 多 agent 驗證 + review（純 JS，OTA 派）
- [x] 6.2 OTA 發佈:改 `app.json` `releaseNotes` + 觸發「Publish OTA」→ 手機收更新後再 smoke test 一次

## 7. 階段 4（可選，另可拆 commit）

- [ ] 7.1 評估:把 in/one/cc 鏡像合併 + `enabledSites` + 設定面板收入 `anime1Provider` 內部（改行為，需另開清楚 commit + 再 smoke test）
