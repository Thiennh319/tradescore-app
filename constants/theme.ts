import { COLORS } from './scoring';

export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 20,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const TYPO = {
  caption: { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.6 },
  label: { fontSize: 11, fontWeight: '600' as const },
  body: { fontSize: 12, fontWeight: '400' as const },
  title: { fontSize: 14, fontWeight: '700' as const },
  hero: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
  section: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;

export const PANEL = {
  backgroundColor: COLORS.surface,
  borderRadius: RADIUS.md,
  borderWidth: 1,
  borderColor: COLORS.border,
} as const;
