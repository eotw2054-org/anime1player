## 1. Data model & state

- [x] 1.1 Add `marks` state `Record<string, { start?: number; end?: number }>` and `marksRef`, kept in sync (like `preferredRef`)
- [x] 1.2 Add `startAtRef` (number|null) — captured before `replace()` so `readyToPlay` never reads `currentRef` for the key
- [x] 1.3 Add `endFiredRef`, `endArmedRef` (booleans) and `lastAdvanceRef` (timestamp) to guard End auto-advance
- [x] 1.4 Load persisted `marks` from AsyncStorage `'marks'` in the settings-load effect (parse + guard)
- [x] 1.5 Add helpers `setMarkField`/`clearMarkField` that update `marks` + `marksRef` synchronously, then persist `'marks'` **immediately (un-throttled)**

## 2. Player behavior — Start

- [x] 2.1 In `playEpisode`, BEFORE `loadStream`/`player.replace()`, set `startAtRef.current = marksRef.current[favKey(anime)]?.start ?? null`
- [x] 2.2 In `readyToPlay`, seek priority: `resumeAtRef` > `startAtRef` > play from 0 (replaces the old `skipRef` branch); consume + clear `startAtRef`

## 3. Player behavior — End (auto-advance)

- [x] 3.1 Reset `endFiredRef=false`, `endArmedRef=false` on each `loadStream` (next to `seekedRef` reset)
- [x] 3.2 In `timeUpdate`, after ad-skip, arm: if `!endArmedRef` and `t < end` then `endArmedRef=true`
- [x] 3.3 Fire only if: `end != null` and `end > (start ?? 0)` and `seekedRef.current` and `endArmedRef.current` and `!endFiredRef.current` and `nextUrl` and `now - lastAdvanceRef > 5000`
- [x] 3.4 On fire: set `endFiredRef`, `lastAdvanceRef=now`, repoint `progressRef[favKey(c.anime)]` to next episode (avoid resume poisoning), then `playEpisode(c.nextUrl, c.anime)` via `currentRef.current`
- [x] 3.5 Stop writing `progressRef` for the current load once End has fired

## 4. Remove global skip

- [x] 4.1 Remove `skip` state, `skipRef`, its sync effect, and AsyncStorage `'skip'` load
- [x] 4.2 Remove the "跳秒" input from `settingsRow`
- [x] 4.3 Remove the now-stale `skipRef` branch in `readyToPlay` (replaced by 2.2)
- [x] 4.4 Remove unused styles `skipField` / `skipLabel` / `skipInput`

## 5. Overlay UI

- [x] 5.1 Extend `PlayerOverlay` props: `mark`, `onSetStart`, `onSetEnd`, `onClearStart`, `onClearEnd`
- [x] 5.2 Add a row above `seekRow`: "設開頭" pinned left, "設結尾" pinned right; each shows `mark?.x == null ? '—' : fmtTime(x)` and a small "✕" clear
- [x] 5.3 Buttons read `player.currentTime` and call handlers; **gate on `current != null && isFinite(player.currentTime)`** (disable otherwise); App handlers early-return when `!currentRef.current`
- [x] 5.4 Make buttons remote-reachable in fullscreen: `focusable`, and in the `hwKey` `ok` branch route by `focusKey` (`set-start`/`set-end`/`clr-*` → set/clear; else play/pause)
- [x] 5.5 Add styles for the marker buttons / clear control
- [x] 5.6 Pass `mark={marks[favKey(current.anime)]}` and the handlers where `PlayerOverlay` is rendered

## 6. Verify & ship

- [x] 6.1 `npx tsc --noEmit` passes
- [ ] 6.2 Manual: set Start → next episode auto-skips intro; set End → auto-advances once; End≤Start does NOT skip-storm; clear reverts; values persist after restart; remote can set in fullscreen
- [ ] 6.3 Manual: after auto-advance, "繼續觀看" resumes the NEW episode (not the skipped one at its end)
- [x] 6.4 Deploy APK (build release + copy to `Z:\Project\AnimePlayer`)
