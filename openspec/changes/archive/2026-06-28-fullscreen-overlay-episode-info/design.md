## Context

`App.tsx` 入面，集數同片名由 `titleBar`（約 line 850）顯示，但兩個 return 分支（landscape / portrait）都只喺 `!fullscreen` 先 render，所以全螢幕時冇任何片名／集數提示。全螢幕嘅控制 UI 全部由 `PlayerOverlay` component 渲染，佢已經收到 `current`、`fullscreen`、`ctrlShown` 三個 prop，所需資料（`current.anime.name`、`current.episodeNo`）已喺手，唔使加 props 或改資料流。

## Goals / Non-Goals

**Goals:**
- 全螢幕 + 控制項顯示時，喺覆蓋層頂部置中顯示片名（第一行）同集數（第二行）。
- 資訊條跟 `ctrlShown` 一齊淡入／淡出，唔搶遙控焦點。
- 改動局限喺 `PlayerOverlay` JSX 同 `StyleSheet`，零型別／資料流改動。

**Non-Goals:**
- 唔改非全螢幕嘅 `titleBar` 行為。
- 唔處理「切換全螢幕黑畫面」問題（屬另一個 change，做法 A 重構 VideoView 掛載位置）。
- 唔加動畫過場（沿用既有 `ctrlShown` 顯隱機制即可）。

## Decisions

- **放喺 `PlayerOverlay` 內、`{ctrlShown && (…)}` 區塊頂部**：令資訊條自動跟其他控制項一齊顯隱，唔使另寫顯隱邏輯。
  - _Alternative_：喺全螢幕 overlay 容器（`fsContainer`）外層加獨立元件 → 要自己接 `ctrlShown` 狀態，重複邏輯，否決。
- **頂部置中、兩行**（用戶選定排版）：第一行 `★ {name} ★` 大而亮，第二行 `第 X 集` 細而淡，建立視覺層次。
  - _Alternative_：左上角單行 → 用戶已明確選頂部置中兩行。
- **`pointerEvents="none"`**：純顯示，避免攔截觸控／搶 D-pad 焦點。
- **片名 `maxWidth:'70%'` + `numberOfLines={1}`**：退出全螢幕掣固定喺 `top:40 right:30`，限寬截斷可避免長名疊到掣上。
- **垂直位置 `top:44`**：略低於退出掣（`top:40`），視覺上分層、避免擠埋。

## Risks / Trade-offs

- [極長片名仍可能視覺貼近退出掣] → `maxWidth:'70%'` + 單行截斷已足夠；如有需要可再收窄。
- [深色字喺光亮畫面睇唔清] → 兩個 Text 都加 `textShadow`（深色陰影）確保對比。
- [呢個 change 唔解決黑畫面 bug] → 已明確列為 Non-Goal，獨立追蹤。
