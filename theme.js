import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Palettes and the theme context.
 *
 * Styles cannot be created once at module scope any more: StyleSheet.create
 * freezes whatever colours it is given, so a module-level stylesheet would stay
 * dark for ever. Each screen instead exports `makeStyles(T)` and calls
 * `useTheme(makeStyles)`, which rebuilds its stylesheet only when the palette
 * actually changes.
 */
export const DARK = {
  name: 'dark',
  bg: '#0B0D12',
  card: '#141821',
  cardHi: '#1B2230',
  border: '#242C3A',
  text: '#E8ECF4',
  dim: '#7C879B',
  green: '#22D38A',
  cyan: '#38BDF8',
  amber: '#FBBF24',
  red: '#F4547A',
  violet: '#A78BFA',
  pink: '#F472B6',
  lime: '#A3E635',
  // Board surfaces, which need different treatment from cards.
  well: '#0F1420',
  wellAlt: '#131924',
  squareLight: '#3A4658',
  squareDark: '#222C3C',
  squareMove: '#4A5540',
  pieceWhite: '#FFFFFF',
  pieceBlack: '#10141C',
  cardFace: '#1A2231',
  cardEdge: '#2A3446',
  cardBack: '#20304A',
  cardBackEdge: '#33456B',
  cardRed: '#FF6B8A',
  cardBlack: '#DDE5F2',
  frame: '#182238',
  hole: '#0E1422',
};

export const LIGHT = {
  name: 'light',
  bg: '#F2F5FA',
  card: '#FFFFFF',
  cardHi: '#EDF1F8',
  border: '#D3DAE7',
  text: '#131722',
  dim: '#5D6A7E',
  // Slightly deeper than the dark-mode accents: the same colours read as
  // washed out against white.
  green: '#0E9F66',
  cyan: '#0284C7',
  amber: '#C2820B',
  red: '#D6335C',
  violet: '#7C4DEF',
  pink: '#DB2E86',
  lime: '#5F9B12',
  well: '#E6EBF3',
  wellAlt: '#DCE3EE',
  squareLight: '#EBEDF0',
  squareDark: '#7D8CA5',
  squareMove: '#BDCB8E',
  pieceWhite: '#FFFFFF',
  pieceBlack: '#1B2029',
  cardFace: '#FFFFFF',
  cardEdge: '#C7D0E0',
  cardBack: '#4C6590',
  cardBackEdge: '#3B5278',
  cardRed: '#D32F5E',
  cardBlack: '#1B2029',
  frame: '#B9C6DC',
  hole: '#E9EEF7',
};

// Vivid accents used for tiles, bricks and pegs. Deliberately shared by both
// themes: these are game pieces, not chrome, and they read on either ground.
export const SPECTRUM = [
  '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#EF4444', '#84CC16', '#3B82F6',
];

const KEY = 'pocket-arcade:theme';
const ThemeContext = createContext({ T: DARK, theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'light' || v === 'dark') setTheme(v); })
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ T: theme === 'light' ? LIGHT : DARK, theme, toggle }),
    [theme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Current palette, plus the stylesheet built from it.
 * Pass the screen's `makeStyles`; omit it if the component only needs colours.
 */
export function useTheme(makeStyles) {
  const ctx = useContext(ThemeContext);
  const s = useMemo(
    () => (makeStyles ? makeStyles(ctx.T) : null),
    [makeStyles, ctx.T]
  );
  return { ...ctx, s };
}
