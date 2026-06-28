import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../types/scoring';
import {
  calculateFinalEntryStatus,
  computeFinalEntryStatusForSide,
  resolveFinalEntryDisplay,
  resolveSqueezeWarning,
} from './finalEntryStatus';
import { calculateSqueezeRisk } from './squeezeRiskEngine';
import { mockTradePlanV3 } from './tradePlanTestFixtures';

describe('calculateFinalEntryStatus', () => {
  it('SETUP NGON + tradePlanValid=false + no block → WAIT_ENTRY', () => {
    expect(
      calculateFinalEntryStatus('SETUP_NGON', false, false, false),
    ).toBe(FinalEntryStatus.WAIT_ENTRY);
    const display = resolveFinalEntryDisplay({
      status: FinalEntryStatus.WAIT_ENTRY,
      scoringDecision: 'SETUP_NGON',
      score: 11.5,
      plan: mockTradePlanV3({ primaryRR: 1.85, tradePlanValid: false }),
      symbol: 'BNBUSDT',
    });
    expect(display.label).toBe('SETUP TỐT — CHỜ ENTRY 🎯');
  });

  it('VAO_TU_TIN + tradePlanValid=true + no block → ENTRY_VALID', () => {
    expect(
      calculateFinalEntryStatus('VAO_TU_TIN', true, false, false),
    ).toBe(FinalEntryStatus.ENTRY_VALID);
    const display = resolveFinalEntryDisplay({
      status: FinalEntryStatus.ENTRY_VALID,
      scoringDecision: 'VAO_TU_TIN',
    });
    expect(display.label).toBe('VÀO TỰ TIN ✅');
  });

  it('SETUP NGON + groupBlock → GROUP_BLOCKED', () => {
    expect(
      calculateFinalEntryStatus('SETUP_NGON', true, false, true),
    ).toBe(FinalEntryStatus.GROUP_BLOCKED);
  });

  it('SETUP NGON + hardBlock → HARD_BLOCKED (ưu tiên cao nhất)', () => {
    expect(
      calculateFinalEntryStatus('SETUP_NGON', true, true, true),
    ).toBe(FinalEntryStatus.HARD_BLOCKED);
  });

  it('KHONG_VAO + tradePlanValid=true → SCORE_BLOCKED', () => {
    expect(
      calculateFinalEntryStatus('KHONG_VAO', true, false, false),
    ).toBe(FinalEntryStatus.SCORE_BLOCKED);
  });

  it('CHO_THEM + tradePlanValid=true → SCORE_BLOCKED', () => {
    expect(
      calculateFinalEntryStatus('CHO_THEM', true, false, false),
    ).toBe(FinalEntryStatus.SCORE_BLOCKED);
  });

  it('VAO_TU_TIN + tradePlanValid=true (TP1 prob thấp, filter tắt) → ENTRY_VALID', () => {
    expect(
      calculateFinalEntryStatus('VAO_TU_TIN', true, false, false),
    ).toBe(FinalEntryStatus.ENTRY_VALID);
  });
});

describe('resolveFinalEntryDisplay ENTRY_VALID borders', () => {
  it('SETUP NGON → gold border', () => {
    const d = resolveFinalEntryDisplay({
      status: FinalEntryStatus.ENTRY_VALID,
      scoringDecision: 'SETUP_NGON',
    });
    expect(d.label).toBe('SETUP NGON 🔥');
    expect(d.borderColor).toBe('#F59E0B');
  });
});

describe('L11 squeezeWarning', () => {
  const longSqueezeExtreme = calculateSqueezeRisk({
    fundingCurrent: 0.015,
    fundingVelocity: 0.005,
    fundingAcceleration: 0.001,
    currentOI: 1_000_000,
    oiChange1h: 7,
    oiChange4h: 12,
    priceChange1h: 1.5,
    priceChange4h: 2,
    longShortRatio: 2.5,
    whaleWallDirection: 'ASK',
    whaleWallDistancePercent: 0.8,
  });

  const shortSqueezeExtreme = calculateSqueezeRisk({
    fundingCurrent: -0.015,
    fundingVelocity: -0.005,
    fundingAcceleration: -0.001,
    currentOI: 1_000_000,
    oiChange1h: 7,
    oiChange4h: 12,
    priceChange1h: -1.5,
    priceChange4h: -2,
    longShortRatio: 0.5,
    whaleWallDirection: 'BID',
    whaleWallDistancePercent: 0.8,
  });

  it('ENTRY_VALID + LONG setup + LONG_SQUEEZE EXTREME → squeezeWarning', () => {
    const result = computeFinalEntryStatusForSide(
      'VAO_TU_TIN',
      mockTradePlanV3({ tradePlanValid: true }),
      { hardBlocks: [], groupBlocks: [] },
      { tradeSide: 'LONG', squeezeRisk: longSqueezeExtreme },
    );
    expect(result.finalEntryStatus).toBe(FinalEntryStatus.ENTRY_VALID);
    expect(result.squeezeWarning).toBe(
      '⚠️ Cảnh báo: thị trường có dấu hiệu ép Long mạnh',
    );
  });

  it('ENTRY_VALID + LONG setup + SHORT_SQUEEZE EXTREME → no warning', () => {
    const warning = resolveSqueezeWarning(
      FinalEntryStatus.ENTRY_VALID,
      'LONG',
      shortSqueezeExtreme,
    );
    expect(warning).toBeNull();
  });
});
