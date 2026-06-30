// lib/remoteProgress.ts —— 遙控器進度條嘅純推算（時鐘偏差已處理，易 test）。
// 用本機收到時間 `_recvAt`（唔信 player 嘅 `at`，兩部 Android 時鐘會 drift）。

export interface RemoteStateLike {
  position?: number;
  duration?: number;
  playing?: boolean;
  _recvAt?: number;
}

/** 超過 ~2× 心跳（6s）冇收到 state → 當連線中斷。 */
export const STALE_MS = 6000;

export function isStale(st: RemoteStateLike | null | undefined, now: number): boolean {
  return !!st && now - (st._recvAt ?? 0) > STALE_MS;
}

/** 推算「而家」嘅播放位置：播放中就由收到時間外推，暫停就用收到嗰刻；過期 → 0。 */
export function livePosition(st: RemoteStateLike | null | undefined, now: number): number {
  if (!st || isStale(st, now)) return 0;
  const base = st.position ?? 0;
  return st.playing ? base + (now - (st._recvAt ?? 0)) / 1000 : base;
}

/** 位置 → 進度條比例（0..1，clamp）。 */
export function progressPct(pos: number, dur: number): number {
  return dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0;
}
