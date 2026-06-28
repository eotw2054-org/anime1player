# fullscreen-episode-info Specification

## Purpose
TBD - created by archiving change fullscreen-overlay-episode-info. Update Purpose after archive.
## Requirements
### Requirement: 全螢幕覆蓋層顯示集數資訊

當系統處於全螢幕播放且有目前播放集（`current` 非空）時，自訂控制覆蓋層（`PlayerOverlay`）SHALL 喺畫面頂部置中顯示一個資訊條，包含動畫名同集數。資訊條 SHALL 只係純顯示元件，唔得攔截觸控或遙控焦點。

#### Scenario: 全螢幕且控制項顯示時顯示資訊

- **WHEN** `fullscreen` 為真、`current` 非空、且控制項顯示中（`ctrlShown` 為真）
- **THEN** 覆蓋層頂部置中顯示兩行：第一行 `★ {current.anime.name} ★`，第二行 `第 {current.episodeNo} 集`

#### Scenario: 控制項收起時一同隱藏

- **WHEN** 控制項收起（`ctrlShown` 為假）
- **THEN** 資訊條同其餘控制項一齊隱藏，唔再顯示

#### Scenario: 非全螢幕不顯示

- **WHEN** `fullscreen` 為假
- **THEN** 覆蓋層唔顯示此資訊條，沿用既有 `titleBar` 顯示集數，行為不變

#### Scenario: 無播放集時不顯示

- **WHEN** `current` 為空
- **THEN** 唔顯示資訊條（無片名或集數可顯示）

### Requirement: 資訊條排版避免遮擋與相撞

資訊條 SHALL 唔阻擋遙控焦點，並 SHALL 避免同右上角「退出全螢幕」掣相撞。

#### Scenario: 不搶遙控焦點

- **WHEN** 資訊條顯示中且用戶用遙控器操作
- **THEN** 焦點仍落喺可操作控制項，資訊條（`pointerEvents="none"`）唔接收任何輸入

#### Scenario: 長動畫名不遮擋退出掣

- **WHEN** 動畫名過長
- **THEN** 動畫名限制最大寬度並單行截斷（`numberOfLines={1}`），唔會疊到右上角退出全螢幕掣

