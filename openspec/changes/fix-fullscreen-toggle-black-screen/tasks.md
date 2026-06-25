## 1. 量度內嵌槽幾何

- [x] 1.1 加 state `slot`（`{x,y,w,h}`）同 `playerSlotRef`，`slot` 初值用 fallback 估算尺寸
- [x] 1.2 寫 `measureSlot()`：`playerSlotRef.current?.measureInWindow((x,y,w,h)=>setSlot({x,y,w,h}))`
- [x] 1.3 喺 `onLayout`、`useWindowDimensions`（width/height）、`sidebarOpen`、`selected` 變動時觸發 `measureSlot()`

## 2. 改內嵌槽為佔位 View

- [x] 2.1 將 `playerBlock` 改為佔位 `View`（掛 `playerSlotRef` + `onLayout={measureSlot}`）
- [x] 2.2 佔位 View 內：播放中時內容透明（唔再喺度 render `playerNode`）；未播放時保留原「揀一集／揀一套」提示
- [x] 2.3 移除兩個 return 分支內 `{fullscreen && isPlaying && <View style={s.fsContainer}>{playerNode}</View>}` 嘅分散 render

## 3. 單一 root 層 host

- [x] 3.1 喺每個 return 分支 root 尾段加單一 host：`{isPlaying && <View style={hostStyle}>{playerNode}</View>}`
- [x] 3.2 計算 `hostStyle`：`fullscreen` → 全屏 style；否則 → `{position:'absolute', left:slot.x, top:slot.y, width:slot.w, height:slot.h, borderRadius, overflow:'hidden'}`
- [x] 3.3 確保 host 只喺 `isPlaying` render，非全螢幕貼合 slot、唔覆蓋其他 UI

## 4. Styles

- [x] 4.1 `fsContainer` 移除 `top:-22`，改 `top:0`（配合 safe-area）
- [x] 4.2 加內嵌 host 基礎 style（`borderRadius`/`overflow:hidden`/`backgroundColor`）維持原內嵌觀感
- [x] 4.3 確認全螢幕 host `zIndex/elevation` 仍為最高（沿用 100）

## 5. 驗證

- [x] 5.1 同方向：內嵌→全螢幕，無黑畫面、畫面連續放大
- [x] 5.2 同方向：全螢幕→內嵌，無黑畫面、畫面連續縮回
- [x] 5.3 切換期間播放不中斷、不重新 seek（同一 player）
- [x] 5.4 內嵌位置／尺寸／圓角同改動前一致（landscape 中欄 + portrait 16:9）
- [x] 5.5 未播放時 host 唔顯示、唔遮其他 UI，佔位提示正常
- [x] 5.6 sidebar 開合 / selected 切換後，內嵌播放器位置仍正確（re-measure 生效）
- [x] 5.7 `tsc --noEmit` 通過
