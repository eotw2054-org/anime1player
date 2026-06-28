## Why

喺全螢幕播放時，顯示集數同片名嘅 `titleBar` 會被收起（兩個 return 分支都只喺 `!fullscreen` 先 render），所以全螢幕睇片嗰陣完全冇任何片名／集數提示。觀眾喺全螢幕（尤其 TV 大畫面）連續睇片時，無從確認自己而家睇緊邊一集。

## What Changes

- 喺全螢幕自訂覆蓋層（`PlayerOverlay`）控制項顯示（`ctrlShown`）期間，於畫面頂部置中加一個純顯示資訊條，分兩行：
  - 第一行：`★ {動畫名} ★`（`current.anime.name`）
  - 第二行：`第 {集數} 集`（`current.episodeNo`）
- 只喺 `fullscreen && current` 為真時顯示；非全螢幕沿用既有 `titleBar`，行為不變。
- 資訊條跟控制項一齊淡入／淡出（受 `ctrlShown` 控制），唔阻擋遙控焦點（`pointerEvents="none"`）。
- 排版避免同右上角「退出全螢幕」掣（`top:40 right:30`）相撞：資訊條置中、動畫名限寬 + 單行截斷。

## Capabilities

### New Capabilities
- `fullscreen-episode-info`: 全螢幕播放覆蓋層內顯示目前播放嘅片名同集數資訊。

### Modified Capabilities
<!-- 無既有 spec-level 行為改變 -->

## Impact

- `App.tsx` — `PlayerOverlay` component（`ctrlShown` 區塊頂部加 JSX）。
- `App.tsx` — `StyleSheet` 新增 `fsTopBar` / `fsTopName` / `fsTopEp` 三個 style。
- 無新增 props（`current`、`fullscreen` 已傳入 `PlayerOverlay`）、無型別或資料流改動、無新依賴。
