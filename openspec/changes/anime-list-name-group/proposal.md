## Why

目前動畫列表係逐筆顯示，slug 唔同但名稱相同嘅動畫會出現多行（例如「將夜」出現兩次、「最強王者的第二人生第二季」出現兩次、「逆天邪神 年番」同「逆天邪神年番」因空格差被視為不同）。用戶要喺重複項中搵到目標動畫，列表冗長且混亂。

## What Changes

- **資料層（`App.tsx` `sections` useMemo）**：filter 完之後按 `name.trim()` 分組合併，同名動畫只顯示一筆。
- **UI `renderAnimeRow`**：合併後的 row 顯示：
  - 動畫名稱（與現有相同）
  - 集數資訊：若多筆集數不同，顯示「第1-12集」範圍；若全部相同，顯示「連載中(12)」
  - 更新年份：若多筆年份不同，顯示「2024／2026年更新」；若全部相同，顯示單一年份
  - 最愛心臟 icon：按 slug 最舊的一筆決定（實際收藏仍以 site+slug 為 key）
  - 點擊行為：若 group 內只有一個 slug → 直接進入（與現有相同）；若有多個 slug → 展開成子列表或彈選單讓用戶揀版本

合併前／後對比：

```
合併前：
將夜    連載中(11) · 2026
將夜    連載中(11) · 2024

合併後：
將夜    連載中(11) · 2024／2026年更新
```

## Capabilities

### New Capabilities
- `name-grouped-list`: 動畫列表按名稱合併顯示，消除重複項。

### Modified Capabilities
- `parseHomeList` 嘅 slug 去重邏輯不變（仍保留所有 slug，grouping 只在 UI 層做，唔影響資料完整性）。

## Impact

- `App.tsx` — `sections` useMemo（~line 612-627）加 name-based grouping 邏輯。
- `App.tsx` — `renderAnimeRow`（~line 841-868）改為接收 group（Anime[]）而非單一 Anime，顯示多筆摘要。
- `App.tsx` — `StyleSheet` 可能需加 `.groupYear`、`.groupEp` 等輔助樣式。
- `App.tsx` — 點擊行為（`openAnime`）需處理多 slug 情況（彈選單或展開）。
- 無新依賴、無型別改動。
