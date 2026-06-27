## Why

而家「跳秒（skip）」係**全域**設定，所有動畫共用同一個開頭跳秒秒數。但每套動畫嘅 OP（片頭）長度唔同、ED（片尾）位置唔同。用戶想**逐套**記低：

- **開頭（Start）**：每集自動跳過片頭，直接由正片開始。
- **結尾（End）**：每集去到片尾位置自動跳去下一集，唔使睇完 ED + 預告。

而且最方便係**邊睇邊設**：喺全螢幕自訂疊層撳一下，就用「目前播放秒數」記低。

## What Changes

喺自訂播放疊層（`PlayerOverlay`）加兩個掣（連顯示已記低嘅值 + 清除）：

- **「設開頭」**：撳一下 → 將 `player.currentTime` 記做該套動畫嘅 **Start**。
  - 之後每次載入呢套嘅任何一集，初始 seek 跳到 Start（**取代全域跳秒**）。
- **「設結尾」**：撳一下 → 將 `player.currentTime` 記做該套動畫嘅 **End**。
  - 播放途中 `currentTime` 一到 End → **自動跳下一集**（似而家 `playToEnd`，但提早喺 End 觸發）。
- 兩個值**逐套（per anime，key = `site|slug`）**儲存喺 AsyncStorage，下次開 app 記得。

```
 一套動畫嘅標記        套用時機
 ┌───────────────┐
 │ start: 0:12   │──▶ 每集 readyToPlay：seek 到 0:12（取代全域跳秒）
 │ end:  21:30   │──▶ timeUpdate：t ≥ 21:30 且有下一集 → playEpisode(next)
 └───────────────┘
```

## Design Decisions

1. **初始 seek 優先次序**（`statusChange === readyToPlay`，App.tsx:368-387）：
   `resumeAtRef`（續看／切來源）＞ **per-anime Start**。（全域跳秒已移除）
   → 主動續看／切來源照舊 seek 返原位；否則用 Start；都冇就由頭播。
   → 自動跳下一集（唔經 `openAnime`，冇 resume）→ 新一集會套用 Start，形成「每集自動跳 OP」。

2. **End 觸發保護**：`timeUpdate` 每秒一次，加 `endFiredRef` 旗（每次載入／換集重設，同 `seekedRef` 一樣），避免重複觸發。只喺有 `nextUrl` 先跳；冇下一集就唔郁（自然播放）。

3. **顯示 + 清除**：兩個掣顯示已記低嘅值（如「開頭 0:12」），各帶一個細「✕」清除；清除後該項回退（Start→全域跳秒；End→`playToEnd` 播完先跳）。

4. **狀態管理**：標記用 `marks` state（UI 顯示）＋ `marksRef`（俾 `readyToPlay`／`timeUpdate` 等一次性註冊嘅 listener 讀最新值），跟現有 `preferredRef`／`fullscreenRef` 同一 pattern。

5. **疊層位置（已定）**：放喺進度條上方一行；**「設開頭」貼左、「設結尾」貼右**（左右分佈，似 prev/next 邊緣掣）。全螢幕 + 視窗共用同一個 `PlayerOverlay`，touch `onPress` 喺全螢幕一樣 work。

## Open Questions（想你拍板）

- **A. 掣擺位**：✅ 已定 —— 進度條上方一行，設開頭貼左 / 設結尾貼右。
- **B. End 無下一集時**：✅ 已定 —— 自然播完（唔特別暫停）。
- **C. 全域「跳秒」欄位去留**：✅ 已定 —— **攞走**。per-anime 開頭完全取代跳秒；冇設開頭嘅動畫由頭播（或續看）。

## Impact

- `App.tsx` `PlayerOverlay`（88-277）：加「設開頭／設結尾」掣 + 顯示 + 清除；新增 props（`mark`、`onSetStart`、`onSetEnd`、`onClearStart`、`onClearEnd`）。
- `App.tsx` `readyToPlay`（368-387）：seek 優先次序用 Start 取代全域跳秒。
- `App.tsx` `timeUpdate`（389-416）：加 End 自動跳集（含 `endFiredRef` 保護）。
- `App.tsx` `loadStream`／載入流程：重設 `endFiredRef`。
- `App.tsx` 設定載入（424-450）：讀 `marks`；新增 `marks` state + `marksRef`。
- `App.tsx` **移除全域跳秒**：`skip` state／`skipRef`／設定載入 `'skip'`／`settingsRow` 入面嘅「跳秒」輸入欄／AsyncStorage `'skip'` 全部攞走。
- `App.tsx` StyleSheet：新增標記掣樣式（並清走 `skipField`／`skipLabel`／`skipInput` 等失效樣式）。
- 無新依賴、無原生改動（純 JS，唔使 rebuild 原生模組，但要 deploy 新 APK）。

## Capabilities

### New
- `per-anime-start-end-markers`：逐套記低片頭（Start）／片尾（End），自動跳 OP + 到 End 自動跳下一集，per anime 儲存。
