## 1. Worker(SyncHub DO)— relay + roster

- [ ] 1.1 `webSocketMessage`:parse;`hello` → `ws.serializeAttachment({deviceId,name,role})` → broadcast roster 俾全部 **+ send roster 返俾 newcomer**(修 join race)。用 `this.state` / `ws.*`(唔係 `this.ctx`)
- [ ] 1.2 其他訊息 → relay 俾其他 socket,**用 `from:deviceId` 排除**(`deserializeAttachment().deviceId !== parsed.from`),**唔用 `s!==ws`**(hibernation 物件 identity 唔保證);跳過 null attachment
- [ ] 1.3 `webSocketClose(ws)` → broadcast roster;砌 roster **明確排除緊閂嗰 ws** + 濾走 null/throw 嘅 `deserializeAttachment()`
- [ ] 1.4 保留現有 PUT `/data` → `/notify`(`{type:'changed'}`)並存
- [ ] 1.5 `wrangler deploy`;假 client 測 hello/roster/relay/cmd round-trip + **確認 sender 唔會收返自己**

## 2. Client — 裝置身份 + 角色

- [ ] 2.1 持久 `deviceId`(首次 random)+ `deviceName`(預設 `Android-<4hex>`)+ `role`('player'|'remote',預設 player),AsyncStorage
- [ ] 2.2 設定面板(A1 / 設定處)加「裝置名稱」可改 + 角色顯示
- [ ] 2.3 `titleBar` 加 segmented `[ 播放器 │ 遙控器 ]` toggle(顯示掣左邊),reuse panelToggle pill + focusProps

## 3. Client — WebSocket 協定

- [ ] 3.1 `wsRef.current` 俾 effect 外 send(每次 check `readyState===1`);onopen → send `hello`;**role 變另開 effect 重 send hello(唔 reconnect,deps `[syncUser]`)**;`roleRef` 喺 onmessage 讀(免 stale closure)
- [ ] 3.2 收 `roster` → 更新 `remotePlayers`;targetId 失效重揀(1 部自動);**未知 type 一律 no-op**(同 `{type:'changed'}` 共 socket)
- [ ] 3.3 收 `cmd` → **`roleRef==='player'` && `targetId===deviceId` && `from!==deviceId` 先執行**:toggle/next/prev/seek/seekTo/fs/playEpisode(playEpisode→`remotePlay`)
- [ ] 3.4 role=player:timeUpdate 節流 ~3s + 事件 → send `state`(帶 `from`、`hasPrev`、`hasNext`);**roster 冇 remote 時可暫停心跳**
- [ ] 3.5 message 帶 `from:deviceId`;`deviceName` 上限 64 字

## 4. Client — 遙控器 UI(player 區變身)

- [ ] 4.1 role=remote → render `remotePanel` 取代 `playerBlock`(唔 load 片)
- [ ] 4.2 Target:1 部靜態名 / >1 部 pulldown(reuse spMenu),離線標示
- [ ] 4.3 Now-playing:title + ep(收 `state`)
- [ ] 4.4 進度條:**另寫 PanResponder**(grant/move 照搬,release **send seekTo**,顯示用推算 —— 唔好 reuse 會寫 `player.currentTime` 嗰個);推算用 `recvAt`(唔用 player `at`)+ clamp duration;拖放 optimistic + **reconcile 窗 ~1.5s**;>6s 冇 state → freeze + 「連線中斷」
- [ ] 4.5 Transport:⏮ ⏯ ⏭ / ⏪ ⏩ / ⛶(reuse ctrBtn);send 對應 cmd;⏮/⏭ 用 `hasPrev/hasNext` disable
- [ ] 4.6 三態:**未登入「請先登入」** / 未連接「未連接到播放器」+ 重新搜尋 / target 離線報錯(toast / 退回)
- [ ] 4.7 D-pad focus:picker→seek→⏮→⏯→⏭→−10→+10→⛶(focusProps/focused)
- [ ] 4.8 列表 tap → **專用 `remotePlay(url,anime)`(完整 Anime payload)**;`openAnime` 喺 remote role 唔行 auto-resume;**唔好**喺 `playEpisode` 落 blanket 分支(免騎劫 auto-advance/overlay/D-pad)
- [ ] 4.9 D-pad/hwKey handler 加 **role guard**:remote role 行 cmd 路徑,唔郁本機 idle player

## 5. 驗證

- [ ] 5.1 兩部機(或假 client):remote 撳 transport → player 反應 <1s
- [ ] 5.2 手機揀集 → 投影機開嗰集 + 全螢幕
- [ ] 5.3 進度條順滑 + 拖放 seek work;now-playing 正確
- [ ] 5.4 未連接 / 對方離線 有提示;>1 player 揀得 target
- [ ] 5.5 free tier 確認(只 WS,無新 binding)

## 6. 部署 / 文檔

- [ ] 6.1 `sync-worker` `wrangler deploy`;client 自架 OTA(`publish-ota.mjs`,runtime 1.0.1)
- [ ] 6.2 `AGENTS.md` / memory:記低遙控協定 + 角色 + roster
