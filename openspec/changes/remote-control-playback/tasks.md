## 1. Worker(SyncHub DO)— relay + roster

- [ ] 1.1 `webSocketMessage`:parse;`hello` → `ws.serializeAttachment({deviceId,name,role})` + broadcast roster
- [ ] 1.2 其他訊息 → relay 俾**其他** socket(`getWebSockets()` 排除 sender)
- [ ] 1.3 `webSocketClose` → broadcast 更新 roster;roster 由 `deserializeAttachment()` 砌(hibernation-safe,無 storage)
- [ ] 1.4 保留現有 PUT `/data` → `/notify`(data 改動 broadcast)並存
- [ ] 1.5 `wrangler deploy`;用假 client 測 hello/roster/relay/cmd round-trip

## 2. Client — 裝置身份 + 角色

- [ ] 2.1 持久 `deviceId`(首次 random)+ `deviceName`(預設 `Android-<4hex>`)+ `role`('player'|'remote',預設 player),AsyncStorage
- [ ] 2.2 設定面板(A1 / 設定處)加「裝置名稱」可改 + 角色顯示
- [ ] 2.3 `titleBar` 加 segmented `[ 播放器 │ 遙控器 ]` toggle(顯示掣左邊),reuse panelToggle pill + focusProps

## 3. Client — WebSocket 協定

- [ ] 3.1 WS onopen → send `hello{deviceId,name,role}`;role 變就重發 + 即時更新
- [ ] 3.2 收 `roster` → 更新 `remotePlayers`;targetId 失效重揀(1 部自動)
- [ ] 3.3 收 `cmd` → **只 role=player 且 targetId==deviceId 執行**:toggle/next/prev/seek/seekTo/fs/playEpisode
- [ ] 3.4 role=player:timeUpdate 節流 ~3s + play/pause/seek/換集事件 → send `state`

## 4. Client — 遙控器 UI(player 區變身)

- [ ] 4.1 role=remote → render `remotePanel` 取代 `playerBlock`(唔 load 片)
- [ ] 4.2 Target:1 部靜態名 / >1 部 pulldown(reuse spMenu),離線標示
- [ ] 4.3 Now-playing:title + ep(收 `state`)
- [ ] 4.4 進度條:reuse seek bar;本機推算(每 0.5s,playing 時 +=);拖放放手 → send `seekTo` + optimistic
- [ ] 4.5 Transport:⏮ ⏯ ⏭ / ⏪ ⏩ / ⛶(reuse ctrBtn);send 對應 cmd
- [ ] 4.6 未連接畫面「未連接到播放器」+ 指引 + 重新搜尋;target 離線報錯(toast / 退回)
- [ ] 4.7 D-pad focus:picker→seek→⏮→⏯→⏭→−10→+10→⛶(focusProps/focused)
- [ ] 4.8 遙控器模式下,列表撳動畫/集數 → send `playEpisode`(唔本機播)

## 5. 驗證

- [ ] 5.1 兩部機(或假 client):remote 撳 transport → player 反應 <1s
- [ ] 5.2 手機揀集 → 投影機開嗰集 + 全螢幕
- [ ] 5.3 進度條順滑 + 拖放 seek work;now-playing 正確
- [ ] 5.4 未連接 / 對方離線 有提示;>1 player 揀得 target
- [ ] 5.5 free tier 確認(只 WS,無新 binding)

## 6. 部署 / 文檔

- [ ] 6.1 `sync-worker` `wrangler deploy`;client 自架 OTA(`publish-ota.mjs`,runtime 1.0.1)
- [ ] 6.2 `AGENTS.md` / memory:記低遙控協定 + 角色 + roster
