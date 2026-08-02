import { describe, expect, it } from 'vitest';
import {
  isNearShortLayerGateSymbol,
  nearShortL3HardBlockReason,
  nearShortL3IsStrong,
  resolveNearShortL3Gate,
  NEAR_V4_LAYER_GATES,
} from './nearV4LayerGates';

describe('NEAR_V4_LAYER_GATES helpers (Option A)', () => {
  it('isNearShortLayerGateSymbol only matches NEARUSDT', () => {
    expect(isNearShortLayerGateSymbol('NEARUSDT')).toBe(true);
    expect(isNearShortLayerGateSymbol('BTCUSDT')).toBe(false);
    expect(isNearShortLayerGateSymbol('SOLUSDT')).toBe(false);
    expect(isNearShortLayerGateSymbol('BNBUSDT')).toBe(false);
  });

  /** Report §6 case 1 */
  it('NEAR + SHORT + L3=1.0 → S1 hard block; no STRONG_L3', () => {
    const r = resolveNearShortL3Gate('NEARUSDT', 'SHORT', 1.0);
    expect(r.hardBlockReason).toContain('NEAR SHORT');
    expect(r.hardBlockReason).toContain('1.5');
    expect(nearShortL3HardBlockReason('NEARUSDT', 'SHORT', 1.0)).toBe(r.hardBlockReason);
    expect(r.signalTags).toEqual([]);
    expect(nearShortL3IsStrong('NEARUSDT', 'SHORT', 1.0)).toBe(false);
  });

  /** Report §6 case 2 */
  it('NEAR + SHORT + L3=1.5 → no S1 block; no STRONG_L3', () => {
    const r = resolveNearShortL3Gate('NEARUSDT', 'SHORT', 1.5);
    expect(r.hardBlockReason).toBeNull();
    expect(r.signalTags).toEqual([]);
  });

  /** Report §6 case 3 */
  it('NEAR + SHORT + L3=2.0 → no S1 block; signalTags STRONG_L3', () => {
    const r = resolveNearShortL3Gate('NEARUSDT', 'SHORT', 2.0);
    expect(r.hardBlockReason).toBeNull();
    expect(r.signalTags).toEqual(['STRONG_L3']);
    expect(nearShortL3IsStrong('NEARUSDT', 'SHORT', 2.0)).toBe(true);
  });

  /** Report §6 case 4 */
  it('NEAR + LONG + L3=1.0 → no S1 (LONG untouched)', () => {
    const r = resolveNearShortL3Gate('NEARUSDT', 'LONG', 1.0);
    expect(r.hardBlockReason).toBeNull();
    expect(r.signalTags).toEqual([]);
  });

  /** Report §6 case 5 — BTC/SOL/BNB SHORT L3=1 unaffected by NEAR gate */
  it('BTC/SOL/BNB + SHORT + L3=1.0 → no S1', () => {
    for (const sym of ['BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const) {
      const r = resolveNearShortL3Gate(sym, 'SHORT', 1.0);
      expect(r.hardBlockReason).toBeNull();
      expect(r.signalTags).toEqual([]);
    }
  });

  it('thresholds match SSOT constants', () => {
    expect(NEAR_V4_LAYER_GATES.SHORT.l3MinHard).toBe(1.5);
    expect(NEAR_V4_LAYER_GATES.SHORT.l3StrongLabelAt).toBe(2);
  });
});
