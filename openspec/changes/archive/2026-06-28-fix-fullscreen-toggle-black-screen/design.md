## Context

`App.tsx` 有兩個 return 分支（`if (isLandscape)` 同 portrait）。`playerNode`（內含單一 `VideoView` + `PlayerOverlay`）目前喺每個分支按 `fullscreen` 出現喺兩個唔同樹位置：

- 非全螢幕：`playerBlock` → `s.playerArea` → `playerCol`（landscape）或直接喺 root（portrait）。
- 全螢幕：root 尾段嘅 `<View style={s.fsContainer}>{playerNode}</View>`。

React 按樹位置 reconcile：`fullscreen` 一變，`playerNode` 由父 A 消失、喺父 B 出現 → 舊 `VideoView` unmount、新嘅 mount → Android 原生 surface 摧毀重建 → 黑畫面（racy → 間歇）。`player` 由 `useVideoPlayer` 來，係持久單例，唔受影響（所以聲音唔斷）。

RN 無內建 portal，唔想加 dependency，所以唔能夠靠 portal 跨分支保持同一掛載點。

## Goals / Non-Goals

**Goals:**
- 同一方向之內切換全螢幕，`VideoView` 保持掛載、surface 唔重建、零黑畫面。
- 內嵌狀態下播放器位置／尺寸／外觀同改動前一致。
- 切換期間播放不中斷、不重新 seek。
- 清走 `fsContainer` 個 `top:-22` 魔術數。

**Non-Goals:**
- 唔保證消除「轉向（portrait↔landscape）」嘅黑畫面（行去唔同 return 分支，無可避免重新掛載；列為已知範圍外）。
- 唔改 `useVideoPlayer` 或播放邏輯。
- 唔加任何第三方 portal／導航庫。

## Decisions

### 1. 單一 root 層絕對定位 host，切 style 而唔 reparent
`playerNode` 喺每個 return 分支只 render 一次，喺 root 尾段一個絕對定位 host 入面，條件係 `isPlaying`（唔再分 `fullscreen`／非全螢幕兩處）。host 嘅 style：
- `fullscreen` → 全屏 style（前 `fsContainer`，`top:0`）。
- 非全螢幕 → `{position:'absolute', left, top, width, height}`，數值來自量度到嘅內嵌槽幾何。

切換全螢幕 = 改 host style → React 唔拆 `VideoView` → surface 存活。

_Alternative_：保持兩處 render 但加 `key`／`collapsable={false}` → 否決，父節點唔同照樣 unmount。
_Alternative_：用 `Modal` 做全螢幕 → 否決，Modal 原生亦會 reparent，且同 expo-video 有相容性風險。

### 2. 內嵌槽用佔位 View + `measureInWindow` 量度
喺原 `playerBlock` 位置放一個佔位 `View`（`ref` + `onLayout`）：
- 播放中：佔位 View 透明佔住版面流；用 `ref.measureInWindow((x,y,w,h)=>setSlot({x,y,w,h}))` 取得螢幕座標，餵俾 host 非全螢幕 style。
- 未播放：佔位 View 仍渲染原本「揀一集／揀一套」提示文字（行為不變）。

需 re-measure 嘅時機：`onLayout`、`useWindowDimensions` 改變（轉向）、`sidebarOpen` 改變、`selected`/版面切換。

_為何用 `measureInWindow` 而唔淨係 `onLayout`_：`onLayout` 只俾相對父層座標，host 喺 root 絕對定位需要螢幕座標。

### 3. Fallback 尺寸避免首幀跳動
`slot` 初值用合理 fallback（如 portrait 16:9 估算、landscape 用 `playerCol` 估算），避免量度返嚟前 host 位置為 0 而閃一下。量到實際值即覆蓋。

### 4. z-index / 顯示守則
host 只喺 `isPlaying` 時 render；非全螢幕時嚴格貼合佔位槽幾何，唔覆蓋其他 UI。全螢幕時 `zIndex/elevation` 高於一切（沿用 `fsContainer` 既有 100）。

## Risks / Trade-offs

- [量度誤差 → 內嵌播放器位置偏差或載入跳一下] → fallback 尺寸 + `onLayout`/dimension/sidebar 改變時 re-measure；measure 喺 layout commit 後執行。
- [`measureInWindow` 時序（量到 0 或舊值）] → 以 `onLayout` 為觸發點再 measure，並喺相關 state（dimensions/sidebar/selected）變動時重量。
- [絕對定位 host 蓋住其他 UI] → 嚴格 `isPlaying` 守 + 貼合槽幾何 + 非全螢幕唔用高 zIndex。
- [轉向仍黑畫面] → 已列 Non-Goal，spec 寫明可接受；如日後要處理需另開 change。
- [Landscape `playerArea` 有 `overflow:hidden` 圓角；host 移去 root 後內嵌圓角觀感可能變] → host 內嵌 style 保留 `borderRadius`/`overflow:hidden` 維持原觀感。

## Migration Plan

1. 加 `slot` state 同 `playerSlotRef`，喺內嵌位置改放佔位 View（量度 + 未播放提示）。
2. 兩個 return 分支移除分散嘅 `playerNode` render，改為 root 尾段單一 host（`isPlaying` 守，style 依 `fullscreen` 切）。
3. 調整 styles：`fsContainer` 移除 `top:-22`；加內嵌 host 基礎 style。
4. 驗證同方向切全螢幕無黑畫面、內嵌位置正確、非播放唔遮 UI。

Rollback：還原 render 結構即可（純前端結構改動，無資料遷移）。

## Open Questions

- 內嵌槽 fallback 初始尺寸用估算定係等首次量度？（傾向 fallback 估算，體驗較順）
- 是否同場順手統一 portrait／landscape 嘅內嵌幾何來源以簡化量度？（可留待實作視複雜度決定）
