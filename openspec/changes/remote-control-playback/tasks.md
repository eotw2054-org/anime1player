## 1. Worker(SyncHub DO)— relay + roster

- [x] 1.1 `webSocketMessage`:`hello` → `ws.serializeAttachment(...)` → broadcast roster 俾全部 + send roster 返 newcomer;用 `this.state`/`ws.*`
- [x] 1.2 其他訊息 → relay 俾其他 socket,**用 `from:deviceId` 排除**(唔用 `s!==ws`);跳過 null attachment
- [x] 1.3 `webSocketClose(ws)` → broadcast roster;明確排除緊閂嗰 ws + 濾 null
- [x] 1.4 保留現有 PUT `/data` → `/notify`(`{type:'changed'}`)並存
- [x] 1.5 `wrangler deploy` + 兩 client e2e 測:roster / relay / cmd / state / **sender 唔收返自己** ✅

## 2. Client — 裝置身份 + 角色

- [x] 2.1 持久 `deviceId` + `deviceName`(預設 `Android-<…>`)+ `role`(預設 player),AsyncStorage
- [ ] 2.2 設定面板改 `deviceName` UI（**未做** —— 暫用自動名;rename UI 留待 v2）
- [x] 2.3 `titleBar` segmented `[ 播放器 │ 遙控器 ]`(顯示掣左邊;遙控面板 header 亦有一個)

## 3. Client — WebSocket 協定

- [x] 3.1 `wsRef`(send 前 check readyState);onopen→hello;role 變 effect 重 send hello;`roleRef` 喺 onmessage 讀
- [x] 3.2 收 `roster` → `remotePlayers` + targetId 自動/保留;**未知 type no-op**
- [x] 3.3 收 `cmd` → `roleRef==='player'` && targetId 啱 && from≠自己 先執行;playEpisode→`remotePlay`/`playEpisode`
- [x] 3.4 role=player:timeUpdate 節流 ~3s send `state`(帶 from/hasPrev/hasNext);執行 cmd 後即回報
- [x] 3.5 message 帶 `from:deviceId`;`deviceName` 64 字上限

## 4. Client — 遙控器 UI

- [x] 4.1 role=remote → `remotePanel` 取代 `playerBlock`(打橫 + 打直)
- [x] 4.2 Target:1 部靜態名 / >1 部撳一下輪換揀
- [x] 4.3 Now-playing:title + ep(收 state)
- [x] 4.4 進度條:獨立 PanResponder,release send `seekTo`;`recvAt` 推算 + clamp;>6s freeze「連線中斷」
- [x] 4.5 Transport:⏮ ⏯ ⏭ / ⏪ ⏩ / ⛶;⏮/⏭ 用 hasPrev/hasNext disable
- [x] 4.6 三態:未登入 / 未連接(+重新搜尋) / 播放中
- [x] 4.7 D-pad focus(focusProps;主掣 hasTVPreferredFocus)
- [x] 4.8 列表 tap → `remotePlay`(完整 Anime);openAnime 喺 remote 唔 auto-resume
- [ ] 4.9 D-pad/hwKey role guard（remote role 本身 idle、handler 已 early-return,影響極微,留 v2）

## 5. 驗證

- [x] 5.1 Worker e2e(假 client):roster / cmd / state / sender 排除 ✅
- [ ] 5.2 **【要兩部機】** remote 撳 transport → player <1s 反應
- [ ] 5.3 **【要兩部機】** 手機揀片 → 投影機播 + 全螢幕;進度條順 + 拖放 seek
- [ ] 5.4 **【要兩部機】** 未連接/離線提示;>1 player 揀 target
- [x] 5.5 free tier(只 WS,無新 binding)✅

## 6. 部署 / 文檔

- [x] 6.1 `sync-worker` `wrangler deploy` + client 自架 OTA(runtime 1.0.1,group c1192bfe)
- [ ] 6.2 `AGENTS.md` / memory:記低遙控協定 + 角色 + roster（待驗證後）
