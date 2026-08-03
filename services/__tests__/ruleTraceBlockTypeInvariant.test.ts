/**
 * Tighten Rule Trace blockType invariants (post L5a HARD→SOFT fix):
 * (a) Every layer in Score Block only → SOFT; in Hard list → HARD
 * (b) L5a ↔ L5b match must not cross-contaminate
 */
import { describe, expect, it } from 'vitest';
import { LAYER_L5B_ID, LAYER_NAMES_V4 } from '../../constants/scoring';
import {
  layerMatchesEngineBlockReason,
  resolveRuleTraceBlockType,
} from '../aiExport/traceLayerPresentation';

/** All V4 display layers that can appear on Rule Trace. */
const ALL_V4_LAYERS: ReadonlyArray<{ layer: number; name: string }> = [
  { layer: 1, name: LAYER_NAMES_V4[1] },
  { layer: 2, name: LAYER_NAMES_V4[2] },
  { layer: 3, name: LAYER_NAMES_V4[3] },
  { layer: 4, name: LAYER_NAMES_V4[4] },
  { layer: 5, name: LAYER_NAMES_V4[5] },
  { layer: LAYER_L5B_ID, name: LAYER_NAMES_V4[LAYER_L5B_ID] },
  { layer: 6, name: LAYER_NAMES_V4[6] },
  { layer: 7, name: LAYER_NAMES_V4[7] },
  { layer: 8, name: LAYER_NAMES_V4[8] },
  { layer: 9, name: LAYER_NAMES_V4[9] },
  { layer: 10, name: LAYER_NAMES_V4[10] },
];

/**
 * Score-block style reasons per layer.
 * Production engine today mainly emits L5a into blockReasons; others are
 * synthetic fixtures so the invariant covers mọi rule (req. mục 4 / (a)).
 */
const SCORE_BLOCK_REASON_BY_LAYER: Record<number, string> = {
  1: 'L1 chưa đủ 2đ — synthetic soft Score Block',
  2: 'L2 RSI chưa đủ — synthetic soft Score Block',
  3: 'L3 MACD yếu — synthetic soft Score Block (not hard list)',
  4: 'L4 Bollinger chưa đủ — synthetic soft Score Block',
  5: 'L5a CVD chưa đủ 1đ — CVD -4K — chưa đủ tín hiệu Short',
  [LAYER_L5B_ID]: 'L5b Volume/OI chưa đủ — synthetic soft Score Block',
  6: 'L6 Funding soft — synthetic soft Score Block',
  7: 'L7 L/S soft — synthetic soft Score Block',
  8: 'L8 BTC soft — synthetic soft Score Block',
  9: 'L9 Phiên soft — synthetic soft Score Block',
  10: 'L10 Tâm lý soft — synthetic soft Score Block',
};

/** Hard-block style reasons per layer (engine-shaped where known). */
const HARD_BLOCK_REASON_BY_LAYER: Record<number, string> = {
  1: 'L1 HARD — synthetic',
  2: 'L2 HARD — synthetic',
  3: 'L3 MACD vi phạm — Histogram âm cả 1H & 4H',
  4: 'L4 HARD — synthetic',
  5: 'CVD +2.10M > +2M — chặn Short hoàn toàn',
  [LAYER_L5B_ID]: 'L5b HARD — synthetic Volume extreme',
  6: 'Funding 0.1200% quá cao — chặn Long',
  7: 'L7 HARD — synthetic',
  8: 'L8 BTC HARD — synthetic',
  9: 'L9 Phiên xấu — ngoài phiên tối ưu',
  10: 'L10 Tâm lý chưa sẵn sàng',
};

describe('(a) invariant — mọi rule Score Block only → SOFT; Hard list → HARD', () => {
  it.each(ALL_V4_LAYERS)(
    'Score Block only: L$layer ($name) → SOFT never HARD',
    ({ layer, name }) => {
      const softReason = SCORE_BLOCK_REASON_BY_LAYER[layer];
      expect(softReason, `missing soft fixture for L${layer}`).toBeTruthy();
      expect(layerMatchesEngineBlockReason(softReason, { layer, name })).toBe(true);

      const blockType = resolveRuleTraceBlockType(
        { layer, name, isMandatoryViolation: layer === 5 },
        [], // hardBlocks empty
        [softReason],
      );
      expect(blockType, `L${layer} Score Block → SOFT`).toBe('SOFT');
      expect(blockType).not.toBe('HARD');
    },
  );

  it.each(ALL_V4_LAYERS)(
    'Hard list: L$layer ($name) → HARD',
    ({ layer, name }) => {
      const hardReason = HARD_BLOCK_REASON_BY_LAYER[layer];
      expect(hardReason, `missing hard fixture for L${layer}`).toBeTruthy();
      expect(layerMatchesEngineBlockReason(hardReason, { layer, name })).toBe(true);

      const blockType = resolveRuleTraceBlockType(
        { layer, name, isMandatoryViolation: false },
        [hardReason],
        [], // scoreBlocks empty
      );
      expect(blockType, `L${layer} Hard list → HARD`).toBe('HARD');
    },
  );

  it('property: for every layer, soft-only never HARD and hard-only is HARD', () => {
    const failures: string[] = [];
    for (const { layer, name } of ALL_V4_LAYERS) {
      const soft = resolveRuleTraceBlockType(
        { layer, name, isMandatoryViolation: false },
        [],
        [SCORE_BLOCK_REASON_BY_LAYER[layer]],
      );
      if (soft !== 'SOFT') failures.push(`SOFT-fail L${layer}: got ${soft}`);

      const hard = resolveRuleTraceBlockType(
        { layer, name, isMandatoryViolation: false },
        [HARD_BLOCK_REASON_BY_LAYER[layer]],
        [],
      );
      if (hard !== 'HARD') failures.push(`HARD-fail L${layer}: got ${hard}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('(b) L5a ↔ L5b match isolation', () => {
  const l5a = { layer: 5, name: LAYER_NAMES_V4[5] };
  const l5b = { layer: LAYER_L5B_ID, name: LAYER_NAMES_V4[LAYER_L5B_ID] };

  it('L5b-only reason does NOT match L5a', () => {
    const reason = 'L5b Volume/OI chưa đủ — OI drop';
    expect(layerMatchesEngineBlockReason(reason, l5a)).toBe(false);
    expect(layerMatchesEngineBlockReason(reason, l5b)).toBe(true);
    expect(
      resolveRuleTraceBlockType({ ...l5a, isMandatoryViolation: false }, [], [reason]),
    ).toBe('NONE');
    expect(
      resolveRuleTraceBlockType({ ...l5b, isMandatoryViolation: false }, [], [reason]),
    ).toBe('SOFT');
  });

  it('L5a-only reason does NOT match L5b', () => {
    const reason = 'L5a CVD chưa đủ 1đ — CVD yếu';
    expect(layerMatchesEngineBlockReason(reason, l5b)).toBe(false);
    expect(layerMatchesEngineBlockReason(reason, l5a)).toBe(true);
    expect(
      resolveRuleTraceBlockType({ ...l5b, isMandatoryViolation: false }, [], [reason]),
    ).toBe('NONE');
    expect(
      resolveRuleTraceBlockType({ ...l5a, isMandatoryViolation: true }, [], [reason]),
    ).toBe('SOFT');
  });

  it('CVD extreme hard (starts with CVD) matches L5a only, not L5b', () => {
    const reason = 'CVD +2.10M > +2M — chặn Short hoàn toàn';
    expect(layerMatchesEngineBlockReason(reason, l5a)).toBe(true);
    expect(layerMatchesEngineBlockReason(reason, l5b)).toBe(false);
    expect(
      resolveRuleTraceBlockType({ ...l5a, isMandatoryViolation: true }, [reason], []),
    ).toBe('HARD');
    expect(
      resolveRuleTraceBlockType({ ...l5b, isMandatoryViolation: false }, [reason], []),
    ).toBe('NONE');
  });

  it('mid-string CVD inside L5b text must NOT falsely match L5a', () => {
    // After tighten: L5a only accepts ^CVD or ^L5a — not \bCVD\b mid-string.
    const reason = 'L5b Volume — note: CVD context unrelated';
    expect(layerMatchesEngineBlockReason(reason, l5a)).toBe(false);
    expect(layerMatchesEngineBlockReason(reason, l5b)).toBe(true);
  });
});

describe('(c) NEAR SHORT S1 L3 gate — matcher + Block Type HARD', () => {
  const l3 = { layer: 3, name: LAYER_NAMES_V4[3] };
  const nearS1 = 'NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)';

  it('matches NEAR S1 reason to L3 (does not start with L3)', () => {
    expect(layerMatchesEngineBlockReason(nearS1, l3)).toBe(true);
  });

  it('does not match NEAR S1 to L1 / L5a', () => {
    expect(
      layerMatchesEngineBlockReason(nearS1, {
        layer: 1,
        name: LAYER_NAMES_V4[1],
      }),
    ).toBe(false);
    expect(
      layerMatchesEngineBlockReason(nearS1, {
        layer: 5,
        name: LAYER_NAMES_V4[5],
      }),
    ).toBe(false);
  });

  it('Hard list with NEAR S1 → L3 Block Type HARD (not NONE)', () => {
    expect(
      resolveRuleTraceBlockType(
        { layer: 3, name: LAYER_NAMES_V4[3], isMandatoryViolation: false },
        [nearS1],
        [],
      ),
    ).toBe('HARD');
  });
});
