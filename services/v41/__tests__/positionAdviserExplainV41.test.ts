import { describe, expect, it } from 'vitest';
import type { DecisionEvaluation } from '../decisionEngine';
import { computeDecisionEngineResult } from '../decisionEngine';
import {
  computePositionAdviserExplainResult,
  explainPositionFromDecision,
} from '../positionAdviserExplainV41';
import { V41_ENGINE_ID } from '../foundation/engineIds';
import { buildV41EngineResult, validateV41EngineResult } from '../foundation/engineResult';
import {
  V41_DECISION_FOUNDATION_STATE,
  V41_CONFIDENCE_FOUNDATION_STATE,
} from '../foundation/states';

function mockDecisionResult(evaluation: DecisionEvaluation) {
  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.DECISION,
    state: evaluation.decision,
    confidence: evaluation.confidence,
    strength: evaluation.strength,
    reviews: [
      {
        id: 'decision:info:reason_0',
        level: 'INFO',
        title: '✓ Trend Reversal xác nhận (4/4 tín hiệu)',
        description: evaluation.reasons[0] ?? '',
        source: V41_ENGINE_ID.DECISION,
      },
      {
        id: 'decision:forward:confidence:info:context_btc',
        level: 'INFO',
        title: '+BTC đồng thuận xu hướng giảm',
        description: 'BTC hỗ trợ đảo bearish',
        source: V41_ENGINE_ID.DECISION,
      },
      {
        id: 'decision:forward:confidence:info:volume',
        level: 'INFO',
        title: '+Volume 2.50× MA20',
        description: 'Volume xác nhận',
        source: V41_ENGINE_ID.DECISION,
      },
      ...evaluation.warnings.map((w, i) => ({
        id: `decision:warn:${i}`,
        level: 'WATCH' as const,
        title: `⚠ ${w}`,
        description: w,
        source: V41_ENGINE_ID.DECISION,
      })),
    ],
    metrics: { marketConfidence: evaluation.confidence, signalCount: 4 },
    debug: { raw: { evaluation } },
  });
}

describe('explainPositionFromDecision', () => {
  it('LONG — sinh Advisor Summary và khuyến nghị tiếng Việt', () => {
    const decision = mockDecisionResult({
      decision: V41_DECISION_FOUNDATION_STATE.LONG,
      confidence: 86,
      strength: 86,
      reasons: [
        'Đủ điều kiện kích hoạt LONG — Confidence 86%',
        'Trend Reversal xác nhận (4/4 tín hiệu)',
        'Market Context đồng thuận',
      ],
      warnings: ['Funding trung lập'],
    });

    const explain = explainPositionFromDecision(decision)!;
    expect(explain.decision).toBe('LONG');
    expect(explain.advisorSummary).toContain('LONG');
    expect(explain.advisorSummary).toContain('Độ tin cậy: 86%');
    expect(explain.nextAction).toContain('LONG');
    expect(explain.reasonsSupporting.some((r) => r.includes('Trend'))).toBe(true);
    expect(explain.warningFactors.some((w) => w.includes('Funding'))).toBe(true);
    expect(explain.assessment).toContain('Đánh giá');
  });

  it('SHORT — sinh Advisor đúng', () => {
    const explain = explainPositionFromDecision(
      mockDecisionResult({
        decision: V41_DECISION_FOUNDATION_STATE.SHORT,
        confidence: 82,
        strength: 80,
        reasons: ['Đủ điều kiện kích hoạt SHORT — Confidence 82%'],
        warnings: [],
      }),
    )!;

    expect(explain.decision).toBe('SHORT');
    expect(explain.nextAction).toContain('SHORT');
    expect(explain.advisorSummary).toContain('SHORT');
  });

  it('WATCH — khuyến nghị tiếp tục quan sát', () => {
    const explain = explainPositionFromDecision(
      mockDecisionResult({
        decision: V41_DECISION_FOUNDATION_STATE.WATCH,
        confidence: 58,
        strength: 55,
        reasons: ['Có tín hiệu nhưng chưa đủ mạnh để giao dịch'],
        warnings: ['Confidence 58% chưa đạt ngưỡng kích hoạt (75%)'],
      }),
    )!;

    expect(explain.decision).toBe('WATCH');
    expect(explain.nextAction).toContain('WATCH');
    expect(explain.warningFactors.length).toBeGreaterThan(0);
  });

  it('IGNORE — không giao dịch', () => {
    const explain = explainPositionFromDecision(
      mockDecisionResult({
        decision: V41_DECISION_FOUNDATION_STATE.IGNORE,
        confidence: 18,
        strength: 15,
        reasons: ['Confidence 18% quá thấp (< 25%)'],
        warnings: [],
      }),
    )!;

    expect(explain.decision).toBe('IGNORE');
    expect(explain.nextAction).toContain('Không giao dịch');
  });
});

describe('computePositionAdviserExplainResult', () => {
  it('trả V41EngineResult hợp lệ với ReviewItem Foundation', () => {
    const decision = mockDecisionResult({
      decision: V41_DECISION_FOUNDATION_STATE.LONG,
      confidence: 86,
      strength: 86,
      reasons: ['Đủ điều kiện kích hoạt LONG — Confidence 86%'],
      warnings: [],
    });

    const adviser = computePositionAdviserExplainResult(decision);
    expect(adviser.engineId).toBe(V41_ENGINE_ID.POSITION_ADVISOR);
    expect(adviser.state).toBe('LONG');
    expect(validateV41EngineResult(adviser).valid).toBe(true);
    expect(adviser.reviews.length).toBeGreaterThan(2);
    expect(adviser.reviews.some((r) => r.title === 'Khuyến nghị')).toBe(true);
    expect(adviser.reviews.some((r) => r.title === 'Đánh giá')).toBe(true);
    expect(adviser.capabilities.canProvideAdvisor).toBe(true);
    expect(adviser.capabilities.canEntry).toBe(false);
  });

  it('không chứa nhãn tiếng Anh WHY / WATCH OUT / NEXT ACTION', () => {
    const adviser = computePositionAdviserExplainResult(
      mockDecisionResult({
        decision: V41_DECISION_FOUNDATION_STATE.WATCH,
        confidence: 50,
        strength: 48,
        reasons: ['Có tín hiệu'],
        warnings: ['Whale chưa xác nhận'],
      }),
    );
    const json = JSON.stringify(adviser);
    expect(json).not.toMatch(/WHY|WATCH OUT|NEXT ACTION|ENTRY VALID/i);
    expect(adviser.reviews.some((r) => r.description.includes('Điểm cần lưu ý'))).toBe(
      true,
    );
  });

  it('integration Decision → Adviser — không gọi Confidence trực tiếp', () => {
    const confidence = buildV41EngineResult({
      engineId: V41_ENGINE_ID.CONFIDENCE,
      state: V41_CONFIDENCE_FOUNDATION_STATE.SCORED,
      confidence: 86,
      strength: 86,
      reviews: [],
      metrics: {},
      debug: {
        raw: {
          decisionContext: {
            proposedDirection: 'SHORT',
            altTrendDirection: 'BULL',
            trendReversalConfirmed: true,
            marketContextPass: true,
            marketContextDenied: false,
            marketContextApplied: true,
            completenessMultiplier: 1,
            trendSignalCount: 4,
            dataInsufficient: false,
            hardBlocks: [],
          },
        },
      },
    });

    const decision = computeDecisionEngineResult(confidence);
    const adviser = computePositionAdviserExplainResult(decision);

    expect(adviser.state).toBe(decision.state);
    expect(adviser.confidence).toBe(decision.confidence);
    expect(adviser.debug?.raw?.sourceDecisionState).toBe(decision.state);
  });
});
