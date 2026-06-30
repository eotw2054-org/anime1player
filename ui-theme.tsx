// ui-theme.tsx —— 主題切換引擎：Provider + hooks(useTheme/useStyles/useThemeControl) + 持久化。
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { THEMES, DEFAULT_THEME, type Theme, type ThemeId } from './theme';
import { makeStyles } from './styles';
import { getItem, setStr } from './storage/persist';

const KEY = 'ui.themeId';
type Styles = ReturnType<typeof makeStyles>;

interface Ctx {
  id: ThemeId;
  theme: Theme;
  styles: Styles;
  setThemeId: (id: ThemeId) => void;
}
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    (async () => {
      try {
        const saved = await getItem(KEY);
        if (saved && THEMES[saved]) setId(saved as ThemeId);
      } catch (e) { if (__DEV__) console.warn(e); }
    })();
  }, []);

  const value = useMemo<Ctx>(() => {
    const theme = (THEMES[id] ?? THEMES[DEFAULT_THEME]).theme;
    return {
      id,
      theme,
      styles: makeStyles(theme), // memo per 主題 → 切換先重砌
      setThemeId: (next: ThemeId) => {
        setId(next);
        setStr(KEY, next).catch((e) => { if (__DEV__) console.warn(e); });
      },
    };
  }, [id]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('useTheme/useStyles 必須喺 <ThemeProvider> 內使用');
  return c;
}
export const useTheme = (): Theme => useCtx().theme;
export const useStyles = (): Styles => useCtx().styles;
export const useThemeControl = () => {
  const c = useCtx();
  return { id: c.id, setThemeId: c.setThemeId };
};
