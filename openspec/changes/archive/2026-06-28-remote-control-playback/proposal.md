## Why

部投影機(Android-TV/projector)行緊呢個 app 做播放器,但用手機 D-pad/觸控喺電視 UI 揀片唔方便。想用**手機做遙控器**控制投影機嘅播放:手機 browse 揀片(舒服),投影機做大 screen。我哋啱啱整好嘅 **SyncHub WebSocket(Durable Object)** 啱啱好做到呢個 —— 免費、零 native、OTA 派得。

## What Changes

喺「顯示」掣左邊加一個 per-device 角色 toggle **[ 播放器 │ 遙控器 ]**(記住設定):

- **播放器**:呢部係被遙控嗰方(照常播片 + 執行收到嘅 cmd)。
- **遙控器**:上面個 player 區**變成遙控面板**,send cmd 控制播放器。

```
遙控器(手機) ──WS cmd──► SyncHub(DO) relay ──► 播放器(投影機) 執行
播放器 ──WS state──► relay ──► 遙控器 顯示 now-playing + 進度條
```

- **Worker(SyncHub DO)**:加 **relay**(一部機嘅 WS message → 轉發俾同帳號其他 socket);用 `serializeAttachment` 記住每個 socket 嘅 `{deviceId, name, role}` 做 roster(hibernation 都記得)。
- **指令**:`toggle`(播/暫停)、`next`/`prev`(上/下集)、`seek`(±10)、`seekTo`(拖放)、`fs`(全螢幕)、`playEpisode`(手機揀集 → 投影機播)。每個 cmd 帶 `targetId`,**只有對應 deviceId 嘅播放器執行**。
- **now-playing 回傳**:播放器喺事件(播/暫停/seek/換集)+ **~3s 心跳** broadcast `{title, ep, position, duration, playing, at}`;遙控器**本機推算**令進度條順滑;**可拖動 seek**(optimistic 即郁,收 sync 校正)。
- **裝置身份**:每部一個持久 `deviceId` + 自動名(例:`Android-A1B2`),**設定可改名**。
- **揀 target**:roster 多過一部播放器 → 遙控器出揀選器(揀邊部);得一部 → 自動鎖定,唔出 pulldown。
- **未連接狀態**:遙控器顯示「未連接到播放器」+ 指引 + 重新搜尋。

## Design Decisions

1. **明確角色 toggle(唔用 implicit)** — 兩部機行同一 app,明確 [播放器|遙控器] 最清楚,杜絕「邊部控邊部」混亂。**只有播放器模式執行 cmd;遙控器只送唔執行**。

2. **Relay 喺 DO 做,只轉俾「其他 socket」** — sender 唔會收返自己嘅訊息 → 唔會自己控自己。roster 用 WS `serializeAttachment` 存喺每個 socket(hibernation-safe),唔使額外 storage(維持 free SQLite-backed DO)。

3. **進度條:事件 + ~3s 心跳 + 本機推算** — 比「每 tick 即時發」慳好多 WS 流量,又比「死板 5s 跳格」順。拖放放手先 send 一次 `seekTo`,沿用現有 seek bar 嘅 drag 模型。

4. **playEpisode 經遙控傳** — 遙控器模式下,喺手機列表撳動畫/集數 → send `playEpisode{url, anime}` 去投影機(唔喺手機播)。呢個係「browse on phone, watch on projector」嘅核心。

5. **全部 reuse 現有 UI component** — toggle = panelToggle pill;target picker = 來源選單 spMenu;進度條 = 現有 seekBar(cyan fill + 白 knob);掣 = ctrBtn / syncBtn。D-pad focus 沿用 `focusProps`/`focused`(cyan 框),focus 次序 picker→seek→⏮→⏯→⏭→−10→+10→⛶,對應全螢幕嗰套手感。

6. **Free tier + OTA** — 純行 SyncHub DO + WS(免費);client 純 JS,自架 OTA 派。runtime 已 `1.0.1`(native remote-keys plugin 嗰邊);呢個 feature 唔加 native,但兩部機要喺 1.0.1 APK 上先收到 OTA。

## Out of Scope

- 真.screen mirroring / Chromecast / AirPlay(要 native module + 重 build,唔需要)。
- 用手機 D-pad 揈成個投影機 UI(要投影機所有畫面支援程式化移焦,大工程;呢個 feature 只控 playback + 揀片)。
- 音量控制(由 OS 處理)。
