/**
 * Task 14.5 — Platform UI split.
 * Desktop/Web: full analysis (Journal / Stats / Performance / Dashboard).
 * APK: thin trading client (Signal + Settings only).
 * No engine / data / intelligence module deletion — presentation gate only.
 */
import { Platform } from 'react-native';

/** Full Intelligence + analysis surfaces (Desktop / Web only). */
export const IS_DESKTOP_ANALYSIS_UI = Platform.OS === 'web';

/** APK / native thin client — Signal + Settings navigation only. */
export const IS_APK_THIN_CLIENT = Platform.OS !== 'web';
