import type { ViewStyle } from 'react-native';
import { SPACING } from './theme';

/** Viewport width below which mobile layout applies. */
export const BREAKPOINT_MOBILE = 768;

/** Very narrow phones — compact tab labels and tighter padding. */
export const BREAKPOINT_COMPACT = 480;

export function isMobileWidth(width: number): boolean {
  return width < BREAKPOINT_MOBILE;
}

export function isCompactWidth(width: number): boolean {
  return width < BREAKPOINT_COMPACT;
}

export function getContentPadding(isCompact: boolean, isMobile: boolean): number {
  if (isCompact) return SPACING.md;
  if (isMobile) return SPACING.lg;
  return SPACING.xl;
}

export function getSignalCardLayout(isMobile: boolean): ViewStyle {
  if (isMobile) {
    return {
      flexBasis: '100%',
      minWidth: 0,
      maxWidth: '100%',
      width: '100%',
    };
  }
  return {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 260,
    maxWidth: 380,
  };
}

export function getPanelMinWidth(isMobile: boolean, desktopMin: number): number | `${number}%` {
  return isMobile ? 0 : desktopMin;
}
