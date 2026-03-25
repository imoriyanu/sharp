// Sharp Design System — Soft Dawn
// Light mode: warm cream canvas, terracotta accent, sage success, rounded organic shapes
// Font: System default (SF Pro on iOS, Roboto on Android)

import { Dimensions, ViewStyle } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_WIDTH = 375;

export function wp(size: number): number {
  return Math.round((size * SCREEN_WIDTH) / BASE_WIDTH);
}

export function fp(size: number): number {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const dampened = 1 + (scale - 1) * 0.5;
  return Math.round(size * dampened);
}

export const colors = {
  bg: {
    primary: '#FAF6F0',
    secondary: '#FFFFFF',
    tertiary: '#F5F0E8',
    screen: '#FAF6F0',
    elevated: '#FFFFFF',
  },
  text: {
    primary: '#2A1A0A',
    secondary: '#6A5A4A',
    tertiary: '#9A8A7A',
    muted: '#B8A898',
    inverse: '#FFFFFF',
  },
  accent: {
    primary: '#C07050',
    dark: '#A05A3A',
    light: '#FFF5EB',
    border: '#F0DCC8',
  },
  score: {
    high: '#5A9A5A',
    mid: '#C07050',
    low: '#C05050',
  },
  recording: '#C05050',
  success: '#5A9A5A',
  warning: '#E8A838',
  error: '#C05050',
  feedback: {
    positiveBg: '#E8F5E8',
    positiveBorder: '#C8E0C8',
    negativeBg: '#FDE8E8',
    negativeBorder: '#F0D0D0',
  },
  border: '#E8E0D4',
  borderLight: '#F0EBE4',
  shadow: 'rgba(80,60,40,0.04)',
  daily: {
    bg: '#FFF5EB',
    bgGradient: '#FFF0E0',
    border: '#F0DCC8',
    text: '#C07050',
  },
  duel: {
    bg: '#F0ECFF',
    bgGradient: '#EDE8FF',
    border: '#E0D8F0',
    text: '#8B7EC8',
    accent: '#8B7EC8',
  },
  docType: {
    identity: { bg: '#E0F0FF', text: '#4080C0' },
    aspiration: { bg: '#F0E8FF', text: '#8B7EC8' },
    evidence: { bg: '#E0F5E0', text: '#5A9A5A' },
    preparation: { bg: '#FFF5EB', text: '#C07050' },
  },
  locked: '#F5F0E8',
  lockedText: '#C0B0A0',
  streak: {
    bg: '#FFF8F0',
    border: '#F0DCC8',
    gold: '#D4A060',
    locked: '#E0D8D0',
  },
};

export const typography = {
  size: {
    xs: fp(10),
    sm: fp(12),
    base: fp(14),
    md: fp(16),
    lg: fp(19),
    xl: fp(24),
    xxl: fp(30),
    title: fp(20),
    hero: fp(42),
    timer: fp(64),
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
    black: '900' as const,
  },
};

export const spacing = {
  xs: wp(4),
  sm: wp(8),
  md: wp(12),
  lg: wp(16),
  xl: wp(22),
  xxl: wp(32),
  section: wp(44),
};

export const radius = {
  sm: wp(8),
  md: wp(12),
  lg: wp(16),
  xl: wp(22),
  pill: 999,
};

export const layout = {
  screenPadding: wp(22),
  cardPadding: wp(18),
};

// Reusable shadow presets (warm-toned, not black)
export const shadows: Record<string, ViewStyle> = {
  sm: { shadowColor: 'rgba(80,60,40,0.06)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6, elevation: 1 },
  md: { shadowColor: 'rgba(80,60,40,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 3 },
  lg: { shadowColor: 'rgba(80,60,40,0.10)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 28, elevation: 5 },
  accent: { shadowColor: '#C07050', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 18 },
};

export function getScoreColor(score: number): string {
  if (score >= 8) return colors.score.high;
  if (score >= 5) return colors.score.mid;
  return colors.score.low;
}
