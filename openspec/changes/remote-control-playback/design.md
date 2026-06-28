# Design — 手機遙控投影機播放

## 架構

```
                       Cloudflare:  animeplayer-sync Worker + SyncHub DO(per user）
 遙控器(手機)                                                  播放器(投影機)
   role=remote                                                   role=player
   │  WS: {type:'cmd', targetId, action, ...}                       │
   ├──────────────────────►  DO.webSocketMessage  ──relay 去其他 socket──►  收 cmd
   │                                                                 │  targetId==自己 → 執行
   │  ◄──── relay {type:'state', deviceId, title, ep, pos, dur, playing, at} ◄── broadcast(事件 + 3s 心跳)
   ▼                                                                 
  顯示 now-playing + 進度條(本機推算)
```

## WebSocket 訊息協定（client ↔ client，經 DO relay）

**每條 relay 訊息都帶 `from:deviceId`**(排除 sender 唔靠物件 identity —— 見下面 review fix)。

- `{ type:'hello', deviceId, name, role }` — 連線即送;DO `ws.serializeAttachment({deviceId,name,role})`。
- `{ type:'roster', devices:[{deviceId,name,role,playing?}] }` — DO broadcast(connect/close/改角色)。
- `{ type:'cmd', from, targetId, action, value? }` — action: `toggle|next|prev|seek|seekTo|fs|playEpisode`。
  - `seek` value=±10;`seekTo` value=ratio(0..1);`playEpisode` value={anime}(見下「playEpisode payload」)。
- `{ type:'state', from, title, ep, position, duration, playing, hasPrev, hasNext, at }` — 播放器報 now-playing。

### playEpisode payload（pin 實 —— blocker fix）
`value.anime` 必須係**完整 Anime**,夠 `favKey()`(`site`+`slug`)同 `resolveSource`/`parseEpisode` 用:
`{ site, slug, title, num?, latestUrl?, cover? }` + 要播嗰集嘅 `episodeUrl`(即 `value = { anime, url }`,url = 該集 episodeUrl)。投影機收到 → `remotePlay(url, anime)`。

## Worker(SyncHub DO)改動

- `webSocketMessage(ws, raw)`:
  - parse;`hello` → `ws.serializeAttachment({deviceId,name,role})` → broadcast roster **俾全部** + 直接 send 一次 roster **返俾 newcomer**(修 join race)。
  - 否則 **relay 俾其他**:用 **deviceId** 排除,唔用 `s!==ws`(hibernation 醒返物件 identity 唔保證)：
    ```
    const from = parsed.from;
    for (const s of this.state.getWebSockets()) {
      const a = s.deserializeAttachment();   // 未 hello → null,跳過
      if (a && a.deviceId !== from) s.send(raw);
    }
    ```
- `webSocketClose(ws)` → broadcast roster;砌 roster 時**明確排除緊閂嗰個 ws** + 跳過 `deserializeAttachment()` 為 null/throw 嘅 socket。
- roster = `getWebSockets()` 各 socket 嘅 `deserializeAttachment()`(濾走 null)。**hibernation-safe**(`serializeAttachment` 係 16KB hibernation 機制,唔係 Storage、唔計 SQLite rows)。
- ⚠️ 用 `ws.serializeAttachment` / `ws.deserializeAttachment`(per-socket)同 `this.state.getWebSockets()`(現有 code 用 `this.state`,**唔係** `this.ctx`)。
- 保留現有 PUT `/data` → `/notify`(`{type:'changed'}` data broadcast)並存。

## Client(App.tsx）

**狀態 / 持久**
- `deviceId`(持久,首次 `randomId()`)、`deviceName`(預設 `Android-<4hex>`,設定可改)、`role`('player'|'remote',預設 player,AsyncStorage `role`)。
- `remotePlayers`(roster 入面 role=player 嘅清單)、`targetId`(揀中嘅播放器;得一部自動)。
- `remoteState`(收到嘅 now-playing) + 本機 interpolation timer。

**WS effect(現有嗰個擴充)** — 用 `wsRef.current`(俾 effect 外嘅 send 用,每次 send 前 check `readyState===1`);`roleRef` 喺 onmessage 讀(避免 stale closure);角色變 → **另一個 effect 重 send `hello`(唔好 reconnect**,deps 維持 `[syncUser]`)。
- onopen → send `hello`。
- onmessage(**未知 type 一律 no-op**,因為 `{type:'changed'}` 同步路徑都行同一條 socket):
  - `changed` → pullMerge()（現有）。
  - `roster` → 更新 remotePlayers;targetId 失效就重揀/清。
  - `state` → 存 remoteState + `recvAt = Date.now()`。
  - `cmd` → 執行條件:**`roleRef==='player'` 且 `targetId===deviceId` 且 `from!==deviceId`**:
    - toggle→play/pause;next/prev→playEpisode(next/prev);seek→currentTime±value;seekTo→currentTime=value*duration;fs→setFullscreen;playEpisode→`remotePlay(value.url, value.anime)`+setFullscreen(true)。
- 播放器:timeUpdate(節流 ~3s)+ play/pause/seek/換集 → send `state`(帶 hasPrev/hasNext)。**roster 冇 remote 時可暫停心跳**(慳,選用)。

**UI**
- 角色 toggle:`titleBar` 加 segmented `[ 播放器 │ 遙控器 ]` 喺「顯示」左邊。
- role=remote → 用 `remotePanel` 取代 `playerBlock`（連 PlayerOverlay 都唔 render，唔 load 片）。
- `remotePanel`:target 標籤/picker + now-playing + 進度條(**另寫一個 PanResponder**:grant/move 數學照搬,但 release **send seekTo(ratio)**,顯示用推算 state,唔好 reuse 會直接寫 `player.currentTime` 嗰個) + transport(reuse ctrBtn);⏮/⏭ 用 `hasPrev/hasNext` disable。
- **列表 tap → `remotePlay`**:唔好喺 `playEpisode` 落 blanket 分支(會騎劫 auto-advance / prev-next overlay / D-pad)。加一個專用 `remotePlay(url,anime)` 俾**用戶 tap**;`openAnime` 喺 remote role 唔好行 auto-resume 嗰段。
- D-pad/hwKey handler 加 **role guard**:remote role 唔好郁本機 idle player,改行 cmd 路徑。

## 進度條(順 + 慳,clock-skew fix）

```
收到 state{position,duration,playing} → 記 {position, playing, recvAt = Date.now()}   // 用「本機收到」時間,唔用 player 嘅 at（兩部 Android 時鐘 drift）
每 0.5s tick:顯示 = clamp(playing ? position + (Date.now()-recvAt)/1000 : position, 0, duration)
state 個 `at` 只用嚟丟棄過期/亂序訊息,唔入顯示計算。
拖動中 → 用 drag 值顯示;放手 → send seekTo(ratio) + optimistic 設 position;
  **reconcile 窗**:send 後 ~1.5s 內(或收到 position 落喺目標容差內之前)忽略 incoming state,免被 seek 前嘅心跳 snap 返。
逾時:>2× 心跳(~6s)冇 state → freeze 推算 + 顯示「連線中斷 / 重新搜尋」。

## Roster / 揀 target

- remotePlayers.length===0 → 未連接畫面。
- ===1 → 自動 targetId = 嗰部;顯示靜態名。
- >1 → pulldown 揀;cmd 帶 targetId;離線/閒置標示。

## 前提 / 安全（review fix）

- **要兩部都登入同一 cloud 帳號**:WS effect 喺 `!syncUser` 會 early-return。遙控面板要分清「**未登入**」同「**未連接到播放器**」兩個狀態。
- **命令 liveness:採用「靠 roster + 心跳新鮮度」,冇 per-command ack**(明確決定,免複雜化)。target 喺 roster 消失 / >6s 冇 state → 報「連線中斷」。
- **安全 trade-off(明確接受)**:同帳號任何登入裝置都可控制任何播放器(per-user DO 就係唯一授權邊界,冇 per-device pairing)。個人/家用 app 可接受。
- `deviceName` 上限 **64 字**(serializeAttachment 16KB 上限,遠夠)。

## 風險(design agent 提）

1. 拖 seek 來回延遲 → optimistic 即郁 + reconcile 窗(見上),唔好 snap 返。
2. 切去遙控器會停自己部機嘅片 → 面板本身係 feedback,toggle 一直喺度可即切返。
3. 選中播放器中途離線 → transport 報錯(toast / 退回未連接),唔好靜靜 no-op。
4. 兩部都 remote → 顯示「冇可控制嘅播放器」。
5. 窄屏 titleBar wrap → toggle 太擠就縮做 icon。

## Free tier / 部署

- 純 SyncHub DO + WS。**留喺 free tier 嘅原因 = DO class 係 SQLite-backed(`wrangler.toml` `new_sqlite_classes=['SyncHub']`),唔係「避開 storage」** —— `serializeAttachment` 係獨立嘅 16KB hibernation 機制(唔計 SQLite rows);就算用 DO Storage 都係 free(5M read / 100k write 每日)。**只要唔轉 KV-backed class 就得**。
- 訊息量:最壞 ~1 萬 inbound WS/日 → ~500 billable req/日 vs 100k free(~0.5%)。relay 係 in-memory `ws.send` fan-out,零 SQLite write。
- Worker:`sync-worker` `wrangler deploy`。Client:自架 OTA(`publish-ota.mjs`)。runtime `1.0.1`(兩部機要喺呢個 APK 上先收到)。
