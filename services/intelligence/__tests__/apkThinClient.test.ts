/**
 * Task 14.5 — APK thin client platform gate.
 */
import { describe, expect, it } from 'vitest';
import { IS_APK_THIN_CLIENT, IS_DESKTOP_ANALYSIS_UI } from '../../../constants/platformUi';

describe('Task 14.5 — Platform UI split', () => {
  it('defines mutually exclusive desktop vs APK presentation flags', () => {
    expect(IS_DESKTOP_ANALYSIS_UI || IS_APK_THIN_CLIENT).toBe(true);
    expect(IS_DESKTOP_ANALYSIS_UI && IS_APK_THIN_CLIENT).toBe(false);
  });
});
