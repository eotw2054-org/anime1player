// hooks/useKeepAwakeWhile.ts —— active 期間 hold 住 keep-awake（全螢幕播放防屏保，
// 獨立於 play/pause，咁卡 buffer / 跳廣告 / 換集 都唔會彈屏保）。
import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export function useKeepAwakeWhile(active: boolean, tag = 'fs-player') {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(tag);
    return () => {
      deactivateKeepAwake(tag);
    };
  }, [active, tag]);
}
