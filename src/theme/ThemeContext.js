import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LightTheme, DarkTheme } from './colors';
import {
  getDarkMode, setDarkMode as saveDarkMode,
  getFontSize as loadFontSize, setFontSize as saveFontSize,
  getAutoLockSeconds as loadAutoLock, setAutoLockSeconds as saveAutoLock,
  getShakeToLock as loadShake, setShakeToLock as saveShake,
  getBiometricEnabled as loadBiometric, setBiometricEnabled as saveBiometric,
} from '../storage/database';

const ThemeContext = createContext();

export const FONT_SIZES = {
  small:  { noteTitle: 15, noteContent: 13, bodyInput: 14, titleInput: 20, label: 'Small' },
  medium: { noteTitle: 17, noteContent: 14, bodyInput: 16, titleInput: 24, label: 'Medium' },
  large:  { noteTitle: 20, noteContent: 16, bodyInput: 18, titleInput: 28, label: 'Large' },
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fontSize, setFontSizeState] = useState('medium');
  const [autoLockSeconds, setAutoLockState] = useState(0);
  const [shakeToLock, setShakeState] = useState(false);
  const [biometricEnabled, setBiometricState] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const dm = await getDarkMode();
        setIsDark(dm === '1');
        setFontSizeState((await loadFontSize()) || 'medium');
        setAutoLockState((await loadAutoLock()) || 0);
        setShakeState(await loadShake());
        setBiometricState(await loadBiometric());
      } catch (_) {}
      setLoaded(true);
    })();
  }, []);

  const toggleTheme = useCallback(async () => {
    const next = !isDark;
    setIsDark(next);
    await saveDarkMode(next ? '1' : '0');
  }, [isDark]);

  const updateFontSize = useCallback(async (size) => {
    setFontSizeState(size);
    await saveFontSize(size);
  }, []);

  const updateAutoLock = useCallback(async (secs) => {
    setAutoLockState(secs);
    await saveAutoLock(secs);
  }, []);

  const updateShakeToLock = useCallback(async (on) => {
    setShakeState(on);
    await saveShake(on);
  }, []);

  const updateBiometric = useCallback(async (on) => {
    setBiometricState(on);
    await saveBiometric(on);
  }, []);

  const theme = isDark ? DarkTheme : LightTheme;
  const fontSizeMap = FONT_SIZES[fontSize] || FONT_SIZES.medium;

  return (
    <ThemeContext.Provider value={{
      theme, isDark, toggleTheme, loaded,
      fontSize, fontSizeMap, updateFontSize,
      autoLockSeconds, updateAutoLock,
      shakeToLock, updateShakeToLock,
      biometricEnabled, updateBiometric,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
