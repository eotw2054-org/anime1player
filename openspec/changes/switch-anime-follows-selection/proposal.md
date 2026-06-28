## Why

揀片時播放器唔跟住選擇變:`openAnime` 只有「有播放紀錄」先會切換播放,揀一套**從未播過**嘅片,播放器仲繼續播緊上一套。遙控器模式仲衰 —— 連有紀錄都唔自動切。用戶嘅心智模型係「揀咗就播」,而家行為前後不一致,標題仲會變咗新片但畫面播緊舊片。

## What Changes

- **本機(player role)撳一套**:拆走「有紀錄」gate。
  - 有紀錄 → resume 上次嗰集(不變)。
  - 冇紀錄 → 即播 source 俾嘅**第一個 url**(唔保證係「真‧第 1 集」),`resumeAtRef = null`。
- **遙控器(remote role)撳一套**:拆走 `roleRef !== 'remote'` gate,改行 `remotePlay(url, anime)` 叫投影機切去同一 url。cmd 唔加 `resumeAt`。
- `remotePlay` 讀 `targetIdRef.current` + `targetId == null` 就 no-op。

## Capabilities

### New Capabilities
- `anime-playback-selection`: 揀/切換一套動畫時,本機播放器跟住切換 —— 有紀錄續看、冇紀錄播 source 第一個 url。

### Modified Capabilities
- `remote-control-playback`: 遙控器模式撳一套(catalog item)而唔淨係撳一集,亦會經 `remotePlay` 叫目標投影機切去;`targetId == null` 唔廣播。

## Impact

- `App.tsx` `openAnime`(~L753):移除兩個 gate + 加 no-history / remote 分支。
- `App.tsx` `remotePlay`(~L1268):觸發點擴到「撳套」+ 讀 `targetIdRef.current` + null no-op。
- 純 JS 改動 → **OTA 派得,唔使 rebuild native**;跟 memory 規矩開 branch + review。
- pre-existing 播放狀態機 race(B1 / inversion / broadcastState 等)**不在本 change**(見 design「Out of scope」)。
