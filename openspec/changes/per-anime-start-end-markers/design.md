## Context

播放器（`expo-video`）由 `useVideoPlayer` 建立，靠幾個一次性註冊嘅 listener 運作：`statusChange`（`readyToPlay` 做初始 seek）、`timeUpdate`（每秒一次：存進度 + 自動跳廣告）、`playToEnd`（播完跳下一集）。目前「跳秒」係**全域** state（`skip` / `skipRef`，存喺 AsyncStorage `'skip'`），喺 `readyToPlay` 做一次初始 seek。進度（resume）逐套存喺 `progressRef`（key = `site|slug`）。

呢個 change 引入**逐套**嘅 Start／End 標記，並**移除全域跳秒**（由 Start 取代）。

## Goals / Non-Goals

**Goals:**
- 喺自訂疊層 `PlayerOverlay` 邊睇邊設：撳「設開頭」記目前秒數做 Start、撳「設結尾」記做 End。
- Start：每集載入自動 seek 到（取代全域跳秒）。
- End：播到該秒自動跳下一集。
- 逐套（`site|slug`）儲存，重開 app 記得。
- 移除全域「跳秒」UI / state / 持久化。

**Non-Goals:**
- 唔做逐集（per-episode）標記 —— Start／End 係**逐套**共用（OP/ED 每集長度一致嘅假設）。
- 唔自動偵測 OP/ED（與既有 `lib/adskip` 廣告偵測無關，互不影響）。
- 唔處理 `anime1.me`（另一 change）。

## Decisions

**1. 資料模型：`marks: Record<string, { start?: number; end?: number }>`，key = `favKey(anime)`。**
- 跟 `progress` 同款（AsyncStorage 一個 JSON blob，key `'marks'`）。
- 同時保留 `marksRef`（俾一次性 listener 讀最新值）+ `marks` state（俾疊層即時重繪），跟現有 `preferredRef`/`fullscreenRef` pattern。為何唔淨用 ref：listener 讀 ref，但疊層顯示已記低嘅值要 re-render，故要 state。

**2. 初始 seek：用專屬 `startAtRef`（喺 `replace()` 之前擷取），優先次序 `resumeAtRef` ＞ `startAtRef` ＞ 由頭播。**
- **⚠ 關鍵 ordering**：`playEpisode` 入面 `loadStream`/`player.replace()` 行喺 `setCurrent` 之前，所以第一次 `readyToPlay` 觸發時 `currentRef` 仲係**上一套**動畫 → 唔可以喺 `readyToPlay` 用 `currentRef.current.anime` 查 Start（會攞錯 key）。
- 解法：喺 `playEpisode`／`loadStream` `replace()` **之前**，將 `startAtRef.current = marksRef.current[favKey(anime)]?.start ?? null`（完全照 `resumeAtRef` 嘅 pattern）。`readyToPlay` 只消費 `startAtRef`，唔查 `currentRef`。
- 主動續看 / 切來源（`resumeAtRef` 有值）最高優先；否則用 `startAtRef`；都冇就由頭播。全域跳秒已移除，再冇 fallback。
- 自動跳下一集唔經 `openAnime`（冇 set `resumeAtRef`，但會 set `startAtRef`）→ 「每集自動跳 OP」。
- *Alternative considered*：Start 凌駕 resume。否決 —— 用戶主動續看時應 seek 返佢睇到嗰度。

**3. End 觸發：喺 `timeUpdate` 檢查 `t >= end`，多重保護避免「整個系列秒跳」。**
- `timeUpdate` 每秒一次，`playEpisode` 係 async，必須有旗避免重複觸發。
- 守則（全部要）：
  1. `end > (start ?? 0)` 先當有效（避免 End ≤ Start 一載入即跳）。
  2. **`endArmedRef`：只喺今次載入曾經觀察到 `currentTime < end` 之後先 arm**（避免一載入已經喺 End 之後即跳；亦擋切來源 resume 到 End 後嘅誤觸）。
  3. `seekedRef.current === true`（初始 seek 已落實先評估）。
  4. `endFiredRef` 一次性旗 + **wall-clock rate-limit**（`lastAdvanceRef`，例如兩次自動跳相隔 < 5s 就唔跳）擋連環跳。
- `endFiredRef`／`endArmedRef` 喺每次 `loadStream` 重設（同 `seekedRef` 一致）。
- 只喺有 `nextUrl` 先跳；冇下一集 → 自然播完（Open Question B）。
- 放喺 `adSkipTarget` 之後，共用已算好嘅 `t`。

**3b. 自動跳集要修正 resume 中毒 + 用正確 anime。**
- `timeUpdate` 每 tick 寫 `progressRef[key] = {url: epN, time: t}`；到 End（~1290s）寫低嘅就係 End 位置。若唔處理，下次 `openAnime` 會 resume 返「已跳過嗰集嘅結尾」→ 再即刻觸發 End → 死循環。
- 解法：End 觸發跳集時，**先將 `progressRef[key]` 指去下一集（time 0）或清走**，並停止為當前 load 再寫進度。
- 自動跳集用 `playEpisode(c.nextUrl, c.anime)`（`c = currentRef.current`），唔好靠 `selected`（用戶可能已揀咗第二套）。

**3c. 設標記掣（safety + 即時持久化）。**
- 掣只喺 `current != null && isFinite(player.currentTime)` 先生效（否則 `favKey(null)` 會 crash / 寫到錯 key / NaN）。
- `onSetStart/onSetEnd/onClear*` 內**先**同步更新 `marksRef.current` + `marks` state，**再**即時（un-throttled）`AsyncStorage.setItem('marks', …)`，唔好跟進度嗰個 5s throttle（避免設完即殺 app 就唔見）。
- 顯示：未設要明確顯示「—」，**唔可以**靠 `fmtTime(undefined)`（會返 `0:00`，同 Start=0 撞）。用 `mark?.start == null ? '—' : fmtTime(mark.start)`。

**3d. 全螢幕遙控可達（已定：Touch + 遙控器都得）。**
- 兩個掣喺全螢幕要 D-pad/遙控撳到，唔可以淨係 touch。
- approach：掣設 `focusable`（連全螢幕都係），喺 `hwKey` handler 嘅 `ok` 分支按 `focusKey` 分流 —— focus 喺 `set-start`/`set-end` 時 OK 觸發對應動作，否則照舊 play/pause。細節 routing 留 apply。

**4. 移除全域跳秒。**
- 刪 `skip` state / `skipRef` / effect / 設定載入 `'skip'` / `settingsRow` 嘅輸入欄 / AsyncStorage `'skip'`。
- `readyToPlay` 嘅 `skipRef` 分支由 Start 取代。
- 清走失效樣式（`skipField` / `skipLabel` / `skipInput`）。

**5. 疊層 UI（`PlayerOverlay`）。**
- 進度條（`seekRow`）上方加一行：「設開頭」貼左、「設結尾」貼右。
- 每掣顯示已記低值（`fmtTime`），未設顯示「—」；各帶細「✕」清除。
- 新增 props：`mark`、`onSetStart`、`onSetEnd`、`onClearStart`、`onClearEnd`。
- `onPress` 喺全螢幕一樣 work（touch 唔受 `focusable={!fullscreen}` 影響）。

## Risks / Trade-offs

- **[End ≤ Start／設得太細 → 整個系列秒跳]** → Mitigation（Decision 3，全部必做）：`end > (start ?? 0)`、`endArmedRef`（觀察到 `currentTime < end` 先 arm）、`seekedRef` gate、`endFiredRef` + wall-clock rate-limit。
- **[Resume 中毒：End 位置被寫入進度]** → 下次續看 resume 返已跳過嗰集結尾再觸發 End。Mitigation（Decision 3b）：跳集時 repoint/清 `progressRef[key]`，停止為當前 load 再寫進度。
- **[Start seek 喺 `readyToPlay` 攞錯 anime key（currentRef 未更新）]** → Mitigation（Decision 2）：用 `startAtRef` 喺 `replace()` 之前擷取，唔靠 `currentRef`。
- **[設標記時 `current` 為 null／`currentTime` 為 NaN]** → Mitigation（Decision 3c）：掣 gate on `current != null && isFinite(currentTime)`。
- **[逐套共用 Start/End，但某幾集 OP/ED 長度唔同]** → 個別集會跳早/跳遲。可接受（Non-Goal：唔做逐集）；用戶可重設。
- **[ad-skip 與 End 同一 tick 寫 currentTime]** → End check 放 ad-skip 之後、用 post-skip `t`；`endArmedRef` 擋住 ad 跳到 End 之後嘅誤觸。
- **[移除全域跳秒屬破壞性 UI 改動]** → Mitigation：Start 提供更佳逐套體驗；AsyncStorage `'skip'` 殘留 key 無害（唔再讀）。

## Open Questions

- 全螢幕遙控達致機制（Decision 3d）嘅確切 `focusKey`/`hwKey` routing 喺 apply 階段落實；若 D-pad focus 與全域 hwKey 攔截衝突，後備方案＝用一個 spare 遙控鍵直接 set。
