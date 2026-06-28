## Why

切換全螢幕／退出全螢幕時，畫面有時會閃黑或卡黑一兩秒先返到畫面。根因係 `App.tsx` 將同一個 `playerNode`（內含 `VideoView`）按 `fullscreen` 狀態 render 喺兩個結構唔同嘅樹位置：非全螢幕喺 `playerBlock` 內、全螢幕喺 root 嘅 `fsContainer` 內。React 按樹位置 reconcile，切換時會 unmount 舊 `VideoView` 再 mount 新嘅，令 Android 原生影像 surface 被摧毀重建，重建有競態，所以黑畫面間歇出現。

## What Changes

- 將 `VideoView`／`playerNode` 改為**只掛載一次**喺一個穩定嘅 root 層絕對定位 host，切換全螢幕只改 host 嘅 style，唔再喺樹之間搬位（reparent），原生 surface 唔再被摧毀。
- 內嵌位置改用一個**佔位 View** + `onLayout`/`measureInWindow` 量度螢幕幾何；host 非全螢幕時貼合該幾何、全螢幕時用全屏 style。
- 清走 `fsContainer` 既有 `top:-22` 魔術偏移，改用正常 `top:0` + safe-area。
- **Scope 限制（重要）**：只解決「**同一方向之內**」切全螢幕嘅黑畫面。打橫↔打直轉向因為行去唔同 return 分支、`VideoView` 本來就會重新掛載，轉向時仍可能閃黑——列為 Non-Goal。

## Capabilities

### New Capabilities
- `fullscreen-toggle-stability`: 切換全螢幕時播放器表面保持穩定、唔出現黑畫面。

### Modified Capabilities
<!-- 無既有 spec-level 行為改變；屬內部 render 結構修正 -->

## Impact

- `App.tsx` — 兩個 return 分支（landscape / portrait）嘅 render 結構：`playerNode` 由分散兩處改為單一 root 層 host；內嵌槽改為佔位 View + 量度。
- `App.tsx` — `StyleSheet`：調整 `fsContainer`（移除 `top:-22`）、新增內嵌 host 動態定位所需 style。
- 不改 `useVideoPlayer`（`player` 本身已係持久單例，聲音本來就連續）。
- 無新依賴、無型別改動。
