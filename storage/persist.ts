// storage/persist.ts —— AsyncStorage 統一封裝：集中所有 key + 常用存取 helper。
// 好處：唔再周圍散落 magic string，改 / 加 key 一處搞掂，亦方便日後抽 hooks。
import AsyncStorage from '@react-native-async-storage/async-storage';

export const K = {
  site: 'site',
  marks: 'marks',
  favorites: 'favorites',
  favAll: 'favAll',
  fsOnPlay: 'fsOnPlay',
  srcLabel: 'srcLabel',
  progress: 'progress',
  enabledSites: 'enabledSites',
  syncUser: 'syncUser',
  syncToken: 'syncToken',
  autoBest: 'autoBest',
  panelOpen: 'panelOpen',
  deviceId: 'deviceId',
  deviceName: 'deviceName',
  role: 'role',
  allowRemote: 'allowRemote',
} as const;

/** 每個站台一份快取清單嘅 key（例：list:https://anime1.in）。 */
export const listKey = (site: string) => 'list:' + site;

export const getItem = (k: string) => AsyncStorage.getItem(k);
export const removeItem = (k: string) => AsyncStorage.removeItem(k);
export const setStr = (k: string, v: string) => AsyncStorage.setItem(k, v);
export const setJSON = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v));
/** boolean → '1' / '0'（同舊有格式一致）。 */
export const setFlag = (k: string, v: boolean) => AsyncStorage.setItem(k, v ? '1' : '0');
