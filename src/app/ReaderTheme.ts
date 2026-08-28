import type {ReaderTheme} from '../persistence/ReaderPreferencesRepository';

export type ReaderPalette = Readonly<{
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  statusBar: 'light-content' | 'dark-content';
}>;

const LIGHT: ReaderPalette = {
  background: '#f7f7f5',
  surface: '#ffffff',
  surfaceMuted: '#eeeeeb',
  text: '#171717',
  muted: '#626262',
  border: '#d2d2cf',
  primary: '#171717',
  primaryText: '#ffffff',
  danger: '#b3261e',
  statusBar: 'dark-content',
};

const SEPIA: ReaderPalette = {
  background: '#f0e7d5',
  surface: '#f7efdf',
  surfaceMuted: '#e6dac3',
  text: '#332b21',
  muted: '#716553',
  border: '#c8b99f',
  primary: '#3b3023',
  primaryText: '#fffaf0',
  danger: '#a63d32',
  statusBar: 'dark-content',
};

const DARK: ReaderPalette = {
  background: '#111111',
  surface: '#191919',
  surfaceMuted: '#242424',
  text: '#f1f1f1',
  muted: '#b2b2b2',
  border: '#414141',
  primary: '#eeeeee',
  primaryText: '#111111',
  danger: '#e05858',
  statusBar: 'light-content',
};

const OLED: ReaderPalette = {
  background: '#000000',
  surface: '#0b0b0b',
  surfaceMuted: '#151515',
  text: '#f3f3f3',
  muted: '#aaaaaa',
  border: '#333333',
  primary: '#f2f2f2',
  primaryText: '#050505',
  danger: '#ee5b5b',
  statusBar: 'light-content',
};

export function resolveReaderPalette(
  theme: ReaderTheme,
  systemDark: boolean,
): ReaderPalette {
  switch (theme) {
    case 'auto':
      return systemDark ? DARK : LIGHT;
    case 'light':
      return LIGHT;
    case 'sepia':
      return SEPIA;
    case 'dark':
      return DARK;
    case 'oled':
      return OLED;
  }
}

export const READER_THEME_LABELS: Readonly<Record<ReaderTheme, string>> = {
  auto: 'Авто',
  light: 'Светлая',
  sepia: 'Сепия',
  dark: 'Тёмная',
  oled: 'OLED',
};
