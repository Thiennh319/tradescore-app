import { describe, expect, it } from 'vitest';
import { collectHardBlockReasons, type HardBlockSnapInput } from '../tradePlanDisplay';

const MACD_BLOCK =
  'L3 MACD vi phạm — Histogram âm cả 2 khung — VI PHẠM';
const BTC_BLOCK = 'BTC biến động 9.00% — quá rủi ro, chặn cả 2 chiều';
const FUNDING_BLOCK = 'Funding 0.0350% quá cao — chặn Long';
const CVD_BLOCK = 'CVD deeply negative and still deteriorating.';

function longSnap(
  hardBlocks: string[],
  overrides: Partial<HardBlockSnapInput> = {},
) {
  return collectHardBlockReasons({
    direction: 'LONG',
    mandatoryViolations: hardBlocks,
    hardBlocked: true,
    longHardBlocks: hardBlocks,
    ...overrides,
  });
}

describe('collectHardBlockReasons — MACD suppress', () => {
  it('suppresses MACD when isNearEntryZone=true and lockedPlanHealthStatus=WEAK', () => {
    const result = longSnap([MACD_BLOCK], {
      isNearEntryZone: true,
      lockedPlanHealthStatus: 'WEAK',
    });

    expect(result).not.toContain(MACD_BLOCK);
    expect(result.some((r) => r.startsWith('L3 MACD vi phạm'))).toBe(false);
  });

  it('keeps MACD when isNearEntryZone=false', () => {
    const result = longSnap([MACD_BLOCK], {
      isNearEntryZone: false,
      lockedPlanHealthStatus: 'WEAK',
    });

    expect(result).toEqual([MACD_BLOCK]);
  });

  it('keeps MACD when lockedPlanHealthStatus=CRITICAL', () => {
    const result = longSnap([MACD_BLOCK], {
      isNearEntryZone: true,
      lockedPlanHealthStatus: 'CRITICAL',
    });

    expect(result).toEqual([MACD_BLOCK]);
  });

  it('only removes MACD; BTC, Funding, CVD stay when near entry and WEAK', () => {
    const input = [MACD_BLOCK, BTC_BLOCK, FUNDING_BLOCK, CVD_BLOCK];
    const result = longSnap(input, {
      isNearEntryZone: true,
      lockedPlanHealthStatus: 'WEAK',
    });

    expect(result).not.toContain(MACD_BLOCK);
    expect(result).toEqual([BTC_BLOCK, FUNDING_BLOCK, CVD_BLOCK]);
  });

  it('regression: omitting isNearEntryZone/lockedPlanHealthStatus keeps legacy behavior', () => {
    const hardBlocks = [MACD_BLOCK, BTC_BLOCK];
    const legacyInput = {
      direction: 'LONG' as const,
      mandatoryViolations: hardBlocks,
      groupBlocks: ['Nhóm A (Xu hướng) 2.0/5đ < 2.5đ'],
      longHardBlocks: hardBlocks,
      shortHardBlocks: ['BTC +3.00% ≥ +2% — chặn Short alt'],
      hardBlocked: true,
    };

    expect(collectHardBlockReasons(legacyInput)).toEqual(hardBlocks);

    expect(
      collectHardBlockReasons({
        direction: 'LONG',
        mandatoryViolations: ['other', 'Nhóm B (Dòng tiền) 1.5/5đ < 2.0đ'],
        groupBlocks: ['Nhóm B (Dòng tiền) 1.5/5đ < 2.0đ'],
        hardBlocked: true,
      }),
    ).toEqual(['other']);

    expect(
      collectHardBlockReasons({
        direction: 'SHORT',
        mandatoryViolations: ['ignored'],
        shortHardBlocks: [FUNDING_BLOCK],
        hardBlocked: true,
      }),
    ).toEqual([FUNDING_BLOCK]);
  });
});
