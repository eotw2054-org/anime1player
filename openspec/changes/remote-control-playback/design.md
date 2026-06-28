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

- `{ type:'hello', deviceId, name, role }` — 連線即送;DO `serializeAttachment` 落個 socket（roster）。
- `{ type:'roster', devices:[{deviceId,name,role,playing?}] }` — DO 喺有人 connect/close/改角色時 broadcast。
- `{ type:'cmd', targetId, action, value? }` — action: `toggle|next|prev|seek|seekTo|fs|playEpisode`。
  - `seek` value=±10;`seekTo` value=ratio(0..1);`playEpisode` value={url, anime}。
- `{ type:'state', deviceId, title, ep, position, duration, playing, at }` — 播放器報 now-playing。

## Worker(SyncHub DO)改動

- `webSocketMessage(ws, raw)`:
  - parse;若 `hello` → `ws.serializeAttachment({deviceId,name,role})` + broadcast roster。
  - 否則 **relay**:`for (s of getWebSockets()) if (s!==ws) s.send(raw)`。
- `webSocketClose` → broadcast roster。
- roster 由 `getWebSockets().map(s => s.deserializeAttachment())` 砌(hibernation-safe,毋須 storage → 維持 SQLite-backed free)。
- 保留現有 PUT `/data` → `/notify`(data 改動嗰個 broadcast,同遙控 relay 並存)。

## Client(App.tsx）

**狀態 / 持久**
- `deviceId`(持久,首次 `randomId()`)、`deviceName`(預設 `Android-<4hex>`,設定可改)、`role`('player'|'remote',預設 player,AsyncStorage `role`)。
- `remotePlayers`(roster 入面 role=player 嘅清單)、`targetId`(揀中嘅播放器;得一部自動)。
- `remoteState`(收到嘅 now-playing) + 本機 interpolation timer。

**WS effect(現有嗰個擴充)**
- onopen → send `hello`。
- onmessage:
  - `roster` → 更新 remotePlayers;targetId 失效就重揀/清。
  - `state` → 存 remoteState（remote 模式用）。
  - `cmd` → **只 role=player 且 targetId==deviceId 先執行**:
    - toggle→play/pause;next/prev→playEpisode(next/prev);seek→currentTime±value;seekTo→currentTime=value*duration;fs→setFullscreen;playEpisode→playEpisode(value.url,value.anime)+setFullscreen(true)。
- 播放器:喺 timeUpdate(節流 ~3s)+ play/pause/seek/換集事件 → send `state`。

**UI**
- 角色 toggle:`titleBar` 加 segmented `[ 播放器 │ 遙控器 ]` 喺「顯示」左邊。
- role=remote → 用 `remotePanel` 取代 `playerBlock`（連 PlayerOverlay 都唔 render，唔 load 片）。
- `remotePanel`:target 標籤/picker + now-playing + 進度條(reuse seek bar，drag→send seekTo) + transport（reuse ctrBtn）。
- 遙控器模式下,列表 `onPress`(動畫/集數)改為 send `playEpisode` 而唔係本機 `openAnime/playEpisode`。

## 進度條(順 + 慳）

```
收到 state{position,playing,at} → 記低
每 0.5s 本機 tick:顯示 = playing ? position + (now - at)/1000 : position
拖動中 → 用 drag 值顯示;放手 → send seekTo(ratio),optimistic 設 position
```

## Roster / 揀 target

- remotePlayers.length===0 → 未連接畫面。
- ===1 → 自動 targetId = 嗰部;顯示靜態名。
- >1 → pulldown 揀;cmd 帶 targetId;離線/閒置標示。

## 風險(design agent 提）

1. 拖 seek 來回延遲 → optimistic 即郁 + 「seeking…」狀態,收 sync 校正,唔好 snap 返。
2. 切去遙控器會停自己部機嘅片 → 面板本身係 feedback,toggle 一直喺度可即切返。
3. 選中播放器中途離線 → transport 報錯(toast / 退回未連接),唔好靜靜 no-op。
4. 兩部都 remote → 顯示「冇可控制嘅播放器」。
5. 窄屏 titleBar wrap → toggle 太擠就縮做 icon。

## Free tier / 部署

- 純 SyncHub DO + WS;relay/state/heartbeat 每 ~3s 一條,微不足道,遠低於 100k req/日。維持 SQLite-backed + hibernation = free。
- Worker:`sync-worker` `wrangler deploy`。Client:自架 OTA(`publish-ota.mjs`)。runtime `1.0.1`(兩部機要喺呢個 APK 上先收到)。
