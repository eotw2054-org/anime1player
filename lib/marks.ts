// lib/marks.ts —— 片頭/片尾標記嘅純變換（無 React、無 IO，易 test）。
// 由 App.tsx 抽出：App 仍然負責 state / 持久化 / 同步，呢度淨係「計新 marks」。
import { type Marks } from './types';

/** 設定某套動畫嘅 start/end 標記到 `time` 秒（`now` = Date.now()，方便 test）。 */
export function setMark(
  marks: Marks,
  key: string,
  field: 'start' | 'end',
  time: number,
  now: number,
): Marks {
  return {
    ...marks,
    [key]: { ...marks[key], [field]: Math.max(0, Math.floor(time)), at: now },
  };
}

/** 清除某套動畫嘅 start/end 標記。 */
export function clearMark(marks: Marks, key: string, field: 'start' | 'end', now: number): Marks {
  const m = { ...marks[key], at: now };
  delete m[field];
  return { ...marks, [key]: m };
}
