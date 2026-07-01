// hooks/useOrientationLock.ts —— 手機版：入全螢幕強制打橫;非全螢幕跟返手機方向（auto-rotate,
// 打橫就出橫屏 UI）。電視固定唔郁。
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export function useOrientationLock(fullscreen: boolean) {
  useEffect(() => {
    if (Platform.isTV) return;
    (async () => {
      try {
        if (fullscreen) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          // 跟手機感應器/系統 auto-rotate（唔再鎖死打直）→ 轉機即切橫屏模式
          await ScreenOrientation.unlockAsync();
        }
      } catch (e) {
        if (__DEV__) console.warn(e);
      }
    })();
  }, [fullscreen]);
}
