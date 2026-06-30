// ===== 多風格主題（multi-style）=====
// 每個 Theme 提供同一組 token；styles.ts 嘅 makeStyles(theme) 由 token 砌 StyleSheet。
// 加新風格 = 加一個 Theme 物件落 THEMES 就得。

export interface Theme {
  // 基底
  ink: string; bg: string; surface: string; raised: string; raised2: string;
  line: string; line2: string;
  text: string; muted: string; mutedDim: string;
  // 強調色（沿用原 key 名,免改 100+ 處 reference；各風格重新賦值）
  rose: string;   // 收藏 / 心心 / love
  violet: string; // 品牌點綴
  cyan: string;   // 主互動 / active / 來源
  good: string;   // 連載中 / live
  amber: string;  // 警示 / 次強調
  glow: string;   // 進度條等發光
  // 由強調色衍生嘅半透明 tint（原本寫死喺 styles 內,抽成 token 先可切換）
  focusBg: string; activeBg: string; activeBorder: string;
  chipOnBg: string; chipOnBorder: string; resumeBorder: string; roleSegOnBg: string;
  loveBg: string; loveSolid: string; loveBtn: string; curOpenBorder: string; brandBorder: string;
  errText: string;
}

// ——— 霓虹夜（現用,值同舊 C 一模一樣 → 現有用戶零變化）———
export const darkNeon: Theme = {
  ink: '#0B0E1A', bg: '#0E1322', surface: '#141A2E', raised: '#1B2440', raised2: '#222C4E',
  line: 'rgba(255,255,255,0.07)', line2: 'rgba(255,255,255,0.12)',
  text: '#F4F6FF', muted: '#8A92B2', mutedDim: '#646E92',
  rose: '#FF4D8D', violet: '#9B5CFF', cyan: '#34E1E8', good: '#5BE6A8', amber: '#FFB23E',
  glow: '#FF4D8D',
  focusBg: 'rgba(52,225,232,0.08)', activeBg: 'rgba(52,225,232,0.10)', activeBorder: 'rgba(52,225,232,0.25)',
  chipOnBg: 'rgba(52,225,232,0.12)', chipOnBorder: 'rgba(52,225,232,0.55)', resumeBorder: 'rgba(52,225,232,0.4)',
  roleSegOnBg: 'rgba(52,225,232,0.18)',
  loveBg: 'rgba(255,77,141,0.16)', loveSolid: 'rgba(255,77,141,0.92)', loveBtn: 'rgba(255,77,141,0.85)',
  curOpenBorder: 'rgba(255,77,141,0.5)', brandBorder: 'rgba(155,92,255,0.4)',
  errText: '#ff7a90',
};

// ——— 咖啡夜（暖色深主題,由 logo 咖啡延伸）———
// rose→珊瑚(love) · cyan→焦糖(主互動) · good→暖金(連載中) · violet→咖啡點綴
export const coffeeNight: Theme = {
  ink: '#140E0A', bg: '#1E1712', surface: '#2A1F18', raised: '#352820', raised2: '#3F3026',
  line: 'rgba(243,233,220,0.09)', line2: 'rgba(243,233,220,0.15)',
  text: '#F3E9DC', muted: '#B9A691', mutedDim: '#897866',
  rose: '#EF9C8E', violet: '#C89A6E', cyan: '#E0A94A', good: '#E6B25A', amber: '#F0C57E',
  glow: '#E0A94A',
  focusBg: 'rgba(224,169,74,0.10)', activeBg: 'rgba(224,169,74,0.12)', activeBorder: 'rgba(224,169,74,0.30)',
  chipOnBg: 'rgba(200,154,110,0.16)', chipOnBorder: 'rgba(200,154,110,0.55)', resumeBorder: 'rgba(224,169,74,0.40)',
  roleSegOnBg: 'rgba(224,169,74,0.18)',
  loveBg: 'rgba(239,156,142,0.18)', loveSolid: 'rgba(239,156,142,0.92)', loveBtn: 'rgba(239,156,142,0.85)',
  curOpenBorder: 'rgba(239,156,142,0.5)', brandBorder: 'rgba(200,154,110,0.45)',
  errText: '#EF9C8E',
};

export const THEMES: Record<string, { label: string; theme: Theme }> = {
  darkNeon: { label: '霓虹夜（預設）', theme: darkNeon },
  coffeeNight: { label: '咖啡夜', theme: coffeeNight },
};
export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = 'darkNeon';
