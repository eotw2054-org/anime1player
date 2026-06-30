// hooks/useOrientationLock.ts —— 手機版：入全螢幕自動打橫，退出自動返打直（電視固定，唔郁）。
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export function useOrientationLock(fullscreen: boolean) {
  useEffect(() => {
    if (Platform.isTV) return;
    (async () => {
      try {
        await ScreenOrientation.lockAsync(
          fullscreen
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      } catch (e) {
        if (__DEV__) console.warn(e);
      }
    })();
  }, [fullscreen]);
}
