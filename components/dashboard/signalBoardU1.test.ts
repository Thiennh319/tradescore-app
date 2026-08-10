import { describe, expect, it } from 'vitest';
import {
  isU1DirectionButtonEnabled,
  shouldShowReadyBadge,
} from './signalBoardU1';

/**
 * Invariant: badge "Sẵn sàng" (READY) ⇔ ít nhất một nút hướng enabled.
 * Regression cho APK compact tip xám trong khi badge vẫn xanh (2026-08-09).
 */
describe('shouldShowReadyBadge ↔ direction buttons', () => {
  it('READY only when at least one direction button is enabled', () => {
    expect(shouldShowReadyBadge(true, false)).toBe(true);
    expect(shouldShowReadyBadge(false, true)).toBe(true);
    expect(shouldShowReadyBadge(true, true)).toBe(true);
    expect(shouldShowReadyBadge(false, false)).toBe(false);
  });

  it('totalScore≥9 / canEnter alone must NOT imply READY when U1 disables both buttons', () => {
    // Ambiguous: official direction exists + directionReady, nhưng U1 tắt cả hai
    const longBtn = isU1DirectionButtonEnabled({
      side: 'LONG',
      officialDirection: 'LONG',
      isAmbiguous: true,
      directionReady: true,
    });
    const shortBtn = isU1DirectionButtonEnabled({
      side: 'SHORT',
      officialDirection: 'LONG',
      isAmbiguous: true,
      directionReady: true,
    });
    expect(longBtn).toBe(false);
    expect(shortBtn).toBe(false);
    expect(shouldShowReadyBadge(longBtn, shortBtn)).toBe(false);
  });

  it('non-official direction ready alone must NOT show READY', () => {
    // Official = LONG; SHORT ready nhưng U1 chỉ cho phép LONG
    const longBtn = isU1DirectionButtonEnabled({
      side: 'LONG',
      officialDirection: 'LONG',
      isAmbiguous: false,
      directionReady: false,
    });
    const shortBtn = isU1DirectionButtonEnabled({
      side: 'SHORT',
      officialDirection: 'LONG',
      isAmbiguous: false,
      directionReady: true,
    });
    expect(longBtn).toBe(false);
    expect(shortBtn).toBe(false);
    expect(shouldShowReadyBadge(longBtn, shortBtn)).toBe(false);
  });

  it('when READY, the expandable LONG/SHORT for that official side is enabled', () => {
    const longBtn = isU1DirectionButtonEnabled({
      side: 'LONG',
      officialDirection: 'LONG',
      isAmbiguous: false,
      directionReady: true,
    });
    const shortBtn = isU1DirectionButtonEnabled({
      side: 'SHORT',
      officialDirection: 'LONG',
      isAmbiguous: false,
      directionReady: false,
    });
    expect(shouldShowReadyBadge(longBtn, shortBtn)).toBe(true);
    // Tip ↑ L active + expand LONG bấm được; SHORT vẫn disabled
    expect(longBtn).toBe(true);
    expect(shortBtn).toBe(false);
  });

  it('official SHORT ready → READY aligns with SHORT button / ↓ S tip', () => {
    const longBtn = isU1DirectionButtonEnabled({
      side: 'LONG',
      officialDirection: 'SHORT',
      isAmbiguous: false,
      directionReady: true,
    });
    const shortBtn = isU1DirectionButtonEnabled({
      side: 'SHORT',
      officialDirection: 'SHORT',
      isAmbiguous: false,
      directionReady: true,
    });
    expect(shouldShowReadyBadge(longBtn, shortBtn)).toBe(true);
    expect(longBtn).toBe(false);
    expect(shortBtn).toBe(true);
  });
});
