// hooks/useOtaUpdate.ts —— 自架 OTA：啟動 + 返前台時靜靜 check + download，有新版先彈提示。
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

export function useOtaUpdate() {
  const [updateReady, setUpdateReady] = useState(false); // 已下載新版本，等用戶確認 reload
  const [updateNotes, setUpdateNotes] = useState<string | null>(null); // 新版本嘅「更新內容」

  useEffect(() => {
    if (__DEV__) return; // dev 行 Metro，唔好 OTA
    let alive = true;
    const check = async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;
        // 確保 bundle 已下載（native CHECK_ON_LAUNCH=ALWAYS 可能已搶先下載，呢個 idempotent）
        try {
          await Updates.fetchUpdateAsync();
        } catch (e) {
          if (__DEV__) console.warn(e);
        }
        // 判斷彈唔彈用 isAvailable，唔好 gate 喺 fetched.isNew —— 否則 native 搶先下載令 isNew=false 就唔彈
        const m: any = (res as any).manifest;
        const notes = m?.extra?.expoClient?.extra?.releaseNotes;
        if (!alive) return;
        setUpdateNotes(typeof notes === 'string' && notes.trim() ? notes.trim() : null);
        setUpdateReady(true);
      } catch {
        // 冇網 / server 錯 → 靜默，唔好阻住用 app
      }
    };
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync(); // 載入啱啱 fetch 落嘅新 bundle，即時生效
    } catch {
      setUpdateReady(false);
    }
  };

  return { updateReady, updateNotes, applyUpdate, dismissUpdate: () => setUpdateReady(false) };
}
