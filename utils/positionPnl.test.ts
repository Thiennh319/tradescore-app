import { describe, expect, it } from 'vitest';
import {
  computePositionPnl,
  formatSignedPercent,
  formatSignedUsdt,
} from './positionPnl';

describe('positionPnl', () => {
  const entry = {
    direction: 'SHORT' as const,
    entryPrice: 2.014,
    leverage: 5,
    size: 6,
  };

  it('computes SHORT pnl when mark drops', () => {
    const snap = computePositionPnl(entry, 1.94);
    expect(snap.pnlPercent).toBeCloseTo(18.37, 1);
    expect(snap.pnlUsdt).toBeCloseTo(1.1, 1);
    expect(snap.notionalUsdt).toBe(30);
  });

  it('computes LONG pnl when mark rises', () => {
    const snap = computePositionPnl(
      { ...entry, direction: 'LONG', entryPrice: 100 },
      102,
    );
    expect(snap.pnlPercent).toBeCloseTo(10, 2);
    expect(snap.pnlUsdt).toBeCloseTo(0.6, 2);
  });

  it('formats signed values', () => {
    expect(formatSignedUsdt(1.234)).toBe('+1.23 USDT');
    expect(formatSignedUsdt(-0.5)).toBe('-0.50 USDT');
    expect(formatSignedPercent(12.5)).toBe('+12.50%');
  });
});
