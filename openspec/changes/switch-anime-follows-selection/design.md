## Context

`openAnime(a)`(App.tsx:753)而家只有兩個條件**同時**成立先會切換播放:

```js
const prog = progressRef.current[favKey(a)];
if (prog?.url && roleRef.current !== 'remote') {   // gate 1: 有紀錄  gate 2: 唔係遙控
  resumeAtRef.current = prog.time || 0;
  playEpisode(prog.url, a);
}
```

`gate 1` 令「冇紀錄」嘅片唔切;`gate 2` 令遙控器模式唔自動切。所以揀一套未播過嘅戲,player 唔跟住跳。**目標就係修呢樣:揀套戲,player 就跟住切過去。**

## Goals / Non-Goals

**Goals:**
- 撳一套戲,player 跟住切去播(本機 + 遙控;有冇紀錄都切)。

**Non-Goals:**
- 唔保證播「真‧第 1 集」—— source 俾嘅第一個 url 就得。
- 遙控唔追續看秒數(投影機由 0/marker 開)。
- 唔改撳「集」;唔加 native(純 JS,OTA)。
- 唔掂 pre-existing 播放狀態機 race(見尾段)。

## Decisions

1. **拆兩個 gate,`openAnime` 一律切換播放,按 `roleRef.current` 分支** —
   - **有紀錄**:`player` → `resumeAtRef.current = prog.time||0` + `playEpisode(prog.url, a)`;`remote` → `remotePlay(prog.url, a)`。
   - **冇紀錄**:target url = 有 `a.num` 用 `buildChapters(...)[0].url`(同步);冇 `a.num` 用 `await fetchHtml` 攞嘅 `out[0].url`(空就 `a.latestUrl`)。**唔排序、唔搵「真 ep1」**,return 第一個就得。`player` → `resumeAtRef.current = null` + `playEpisode(targetUrl, a)`;`remote` → `remotePlay(targetUrl, a)`。
   - 有紀錄分支播完仍要 **fall through** 去現有 `setChapters`/`fetchHtml` 砌集數格,唔好即 `return`。
   - `resumeAtRef.current = null`(冇紀錄)係要寫嘅一行:否則會 seek 去上一套嘅秒數。

2. **遙控:`remotePlay` 讀 `targetIdRef.current` + null no-op,唔帶 resumeAt** — `remotePlay`(L1268)若 `targetId` null,player 端 `execCmd` 會令 null targetId 派俾所有 player 一齊播(0/≥2 player 時 `targetId` 可 null)。喺 `remotePlay` 讀 `targetIdRef.current` 砌 payload + null 就 no-op。cmd 維持 `{url, anime}`,唔加 resumeAt。

## Out of scope — 唔喺呢條 change 做

以下全部係**今日已經存在**嘅 latent race(`openAnime` 今日已 call `playEpisode`,L759),本 change 唔引入、單用戶罕中。為咗令呢個 fix 細、低風險,**唔處理**;若實際用起見到先另開 change:

- 兩個 in-flight `playEpisode` 喺 `player.replace` 撞嘅 ordering inversion;切片時 `timeUpdate` 把新 stream ~0 秒寫入舊套 progress(B1);auto-advance 撞切片;`broadcastState` 300ms 派舊 title;`readyToPlay` seek-0;grid tap 讀 stale `selected`;快速連揀 no-`num` 片嘅 stale-fetch 搶播;parse 失敗時 `selected` 唔 rollback。

## Risks / Trade-offs

- **[撳套即播太進取]** 想純瀏覽唔即播就冇得 → 用戶明確選「揀咗就播」,接受。
- **[第一個 url 唔一定 ep1]** 明確接受 —— 用戶話事。
- **[pre-existing race 唔修]** 維持現狀(罕中、自我修正),已列 Out of scope。

## Migration Plan

- 純 JS 改 `App.tsx` → `npx tsc --noEmit` → OTA 發佈。開 branch + review(跟 memory 規矩)。Rollback:OTA 回滾或 revert。

## Open Questions

- 冇。
