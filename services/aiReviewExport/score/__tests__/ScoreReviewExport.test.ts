import { describe, expect, it } from 'vitest';
import { buildScoreReview, buildScoreReviewExport } from '../index';
import type { ScoreReviewInput } from '../ScoreReviewTypes';

function fullInput(): ScoreReviewInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-008',
      coin: 'BTCUSDT',
      side: 'LONG',
      timestamp: '2026-07-18T04:00:00.000Z',
      scoreVersion: 's3.0',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
    },
    marketSnapshot: {
      Trend: 'UP',
      EMA20: 106210,
      RSI: 61,
      MACD: 'BULLISH',
      ATR: 850,
      Funding: 0.008,
      OI: 245000000,
      Volume: 2450000,
      Liquidity: 5200000,
      Spread: 0.03,
      CVD: 320000,
      Whale: 105500,
      Support: 105500,
      Resistance: 107200,
      Timing: 'LONDON',
    },
    summary: {
      totalScore: 86,
      grade: 'A',
      confidence: 0.84,
      status: 'PASS',
      recommendation: 'ENTER',
      maxScore: 100,
      currentScore: 86,
      penalty: -4,
      bonus: 6,
    },
    breakdown: [
      {
        indicator: 'Trend',
        score: 18,
        max: 20,
        weight: 0.2,
        result: 'PASS',
        reason: 'EMA20 rising with price above',
      },
      {
        indicator: 'Volume',
        score: 14,
        max: 15,
        weight: 0.15,
        result: 'PASS',
        reason: 'Volume above average',
      },
      {
        indicator: 'Funding',
        score: 8,
        max: 10,
        weight: 0.1,
        result: 'WARNING',
        reason: 'Funding slightly elevated',
      },
    ],
    penalties: [
      {
        penalty: 'Spread Penalty',
        reason: 'Spread above ideal band',
        evidence: [{ label: 'Spread', value: 0.03 }],
        priority: 'LOW',
      },
    ],
    bonuses: [
      {
        bonus: 'Session Bonus',
        reason: 'London session window',
        evidence: [{ label: 'Timing', value: 'LONDON' }],
        priority: 'MEDIUM',
      },
    ],
    scoreEvidence: [
      {
        indicator: 'Trend',
        evidence: [
          { label: 'EMA20', value: 106210 },
          { label: 'Price', value: 107000 },
        ],
      },
      {
        indicator: 'Volume',
        evidence: [{ label: 'Volume', value: 2450000 }],
      },
    ],
    dependencies: [
      { indicator: 'EMA', module: 'Trend Module' },
      { indicator: 'Funding', module: 'Funding Module' },
      { indicator: 'Volume', module: 'Volume Module' },
    ],
    thresholds: [
      {
        indicator: 'RSI',
        actual: 61,
        expected: '40-70',
        threshold: 70,
        difference: -9,
        priority: 'MEDIUM',
      },
      {
        indicator: 'Funding',
        actual: 0.008,
        expected: '< 0.02',
        threshold: 0.02,
        difference: -0.012,
        priority: 'HIGH',
      },
    ],
  };
}

const SECTIONS = [
  '# REVIEW MISSION',
  '# Metadata',
  '# MARKET SNAPSHOT',
  '# SCORE SUMMARY',
  '# SCORE BREAKDOWN',
  '# PENALTIES',
  '# BONUSES',
  '# HARD / GROUP BLOCKS',
  '# SCORE EVIDENCE',
  '# SCORE DEPENDENCY',
  '# THRESHOLD REVIEW',
  '# DECISION EXPLANATION',
  '# DECISION POLICY',
  '# REVIEW FOCUS',
  '# CONFLICT DETECTION',
  '# AI REVIEW',
  '# CURSOR IMPLEMENTATION PROMPT',
  '# PATCH REQUIREMENTS',
  '# FIX VALIDATION CHECKLIST',
  '# NEXT REVIEW',
  '# FINAL VERDICT',
];

describe('TASK 17.2 Score Review Export', () => {
  it('Empty — exports every section with UNAVAILABLE, self-contained', () => {
    const md = buildScoreReviewExport({});
    for (const s of SECTIONS) expect(md).toContain(s);
    expect(md).toContain('Total Score: UNAVAILABLE');
    expect(md).toContain('Grade: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
    // Self-contained: no cross-file references.
    expect(md).not.toContain('01_RULEBOOK.md');
    expect(md).not.toContain('02_SCORE_ENGINE.md');
    expect(md).not.toContain('SEE ');
  });

  it('Full Score — metadata, snapshot and summary copied verbatim', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('Score Version: s3.0');
    expect(md).toContain('Trend: UP');
    expect(md).toContain('Total Score: 86');
    expect(md).toContain('Grade: A');
    expect(md).toContain('Max Score: 100');
    expect(md).toContain('Recommendation: ENTER');
  });

  it('Bonus — table with reason, evidence and priority', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('| Bonus | Reason | Evidence | Priority |');
    expect(md).toContain(
      '| Session Bonus | London session window | Timing=LONDON | MEDIUM |',
    );
    // Summary bonus copied, not summed.
    expect(md).toContain('Bonus: 6');
  });

  it('Penalty — table with reason, evidence and priority', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('| Penalty | Reason | Evidence | Priority |');
    expect(md).toContain(
      '| Spread Penalty | Spread above ideal band | Spread=0.03 | LOW |',
    );
    expect(md).toContain('Penalty: -4');
  });

  it('Breakdown — one row per indicator, values copied not recomputed', () => {
    // Score intentionally inconsistent with weight: copied verbatim.
    const input = fullInput();
    input.breakdown = [
      { ...input.breakdown![0], score: 999 },
      ...input.breakdown!.slice(1),
    ];
    const md = buildScoreReviewExport(input);
    expect(md).toContain(
      '| Indicator | Score | Max | Weight | Result | Reason |',
    );
    expect(md).toContain(
      '| Trend | 999 | 20 | 0.2 | PASS | EMA20 rising with price above |',
    );
    expect(md).toContain('| Funding | 8 | 10 | 0.1 | WARNING |');
  });

  it('Threshold — actual, expected, difference and priority copied', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain(
      '| Indicator | Actual | Expected | Threshold | Difference | Priority |',
    );
    expect(md).toContain('| RSI | 61 | 40-70 | 70 | -9 | MEDIUM |');
    expect(md).toContain('| Funding | 0.008 | < 0.02 | 0.02 | -0.012 | HIGH |');
  });

  it('Dependency — indicator to module mapping copied', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('Trend Module');
    expect(md).toContain('Funding Module');
    expect(md).toContain('Volume Module');
  });

  it('Score Evidence — each indicator emitted once, duplicate dropped', () => {
    const input = fullInput();
    input.scoreEvidence = [
      ...(input.scoreEvidence ?? []),
      { indicator: 'Trend', evidence: [{ label: 'DUP', value: 1 }] },
    ];
    const review = buildScoreReview(input);
    const trend = review.scoreEvidence.filter(
      (item) => item.indicator === 'Trend',
    );
    expect(trend).toHaveLength(1);
    expect(trend[0].evidence.some((e) => e.label === 'DUP')).toBe(false);
  });

  it('Conflict — all four structural scenarios detected from copied values', () => {
    const overMax = fullInput();
    overMax.summary = { ...overMax.summary, currentScore: 120, maxScore: 100 };
    const md1 = buildScoreReviewExport(overMax);
    expect(md1).toContain('Conflict: YES');
    expect(md1).toContain(
      'Reason: Current Score 120 greater than Max Score 100',
    );

    const negative = fullInput();
    negative.summary = { ...negative.summary, currentScore: -5 };
    const md2 = buildScoreReviewExport(negative);
    expect(md2).toContain('Reason: Current Score -5 below zero');

    const dupPenalty = fullInput();
    dupPenalty.penalties = [
      ...(dupPenalty.penalties ?? []),
      { penalty: 'Spread Penalty', reason: 'again' },
    ];
    const md3 = buildScoreReviewExport(dupPenalty);
    expect(md3).toContain('Reason: Penalty Spread Penalty duplicated');

    const dupBonus = fullInput();
    dupBonus.bonuses = [
      ...(dupBonus.bonuses ?? []),
      { bonus: 'Session Bonus', reason: 'again' },
    ];
    const md4 = buildScoreReviewExport(dupBonus);
    expect(md4).toContain('Reason: Bonus Session Bonus duplicated');

    // Consistent snapshot has no conflict.
    expect(buildScoreReviewExport(fullInput())).toContain('Conflict: NO');
  });

  it('AI Review template — blank table with severity column', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('| Review Item | Result | Severity | Notes |');
    expect(md).toContain('| Wrong Weight | □ | | |');
    expect(md).toContain('| Wrong Grade | □ | | |');
    expect(md).toContain('| Duplicate Indicator | □ | | |');
    expect(md).toContain('| Need Optimization | □ | | |');
  });

  it('Cursor Fix template — blank field table rendered', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('# CURSOR IMPLEMENTATION PROMPT');
    expect(md).not.toContain('# CURSOR FIX REQUEST');
    expect(md).toContain('| Module | |');
    expect(md).toContain('| Root Cause | |');
    expect(md).toContain('| Acceptance Criteria | |');
    expect(md).toContain('### Allowed Files\n\n-');
    expect(md).toContain('### Architecture Requirement\n\n-');
  });

  it('Validation — Score-specific checklist unticked, verdict last', () => {
    const md = buildScoreReviewExport(fullInput());
    expect(md).toContain('| Only Score module modified | □ |');
    expect(md).toContain('| Rule unchanged | □ |');
    expect(md).toContain('| Entry unchanged | □ |');
    expect(md).toContain('1. Export lại SCORE_REVIEW.md');
    const verdictIndex = md.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(md.indexOf('# NEXT REVIEW'));
    expect(md.slice(verdictIndex + 1)).not.toContain('\n# ');
    expect(md).toContain('- [ ] INVALID');
    expect(md).toContain('Confidence:');
    expect(md).toContain('Reason:');
  });

  it('Stable — deterministic across repeated exports', () => {
    const input = fullInput();
    expect(buildScoreReviewExport(input)).toBe(buildScoreReviewExport(input));
    expect(buildScoreReviewExport(input)).toBe(
      buildScoreReviewExport(fullInput()),
    );
  });

  it('Byte identical — equivalent snapshots encode to identical bytes', () => {
    const first = new TextEncoder().encode(buildScoreReviewExport(fullInput()));
    const second = new TextEncoder().encode(
      buildScoreReviewExport(fullInput()),
    );
    expect([...first]).toEqual([...second]);
  });

  it('No mutation — input snapshot untouched after export', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    buildScoreReviewExport(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('No undefined and no null — no leaked literal, no object dump', () => {
    const md = buildScoreReviewExport({
      metadata: null,
      marketSnapshot: null,
      summary: { grade: undefined, totalScore: null },
      breakdown: [{ indicator: 'Trend', score: undefined, reason: null }],
      penalties: null,
      bonuses: null,
      scoreEvidence: null,
      dependencies: null,
      thresholds: null,
      hardBlocks: null,
      decision: null,
    });
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
    expect(md).toContain('Grade: UNAVAILABLE');
    expect(md).toContain('Total Score: UNAVAILABLE');
  });

  // ── TASK 17.X — Score Review Fix (AI Review Findings) ──────────────

  it('17.X F1 — HardBlocked NO with hard block entries is a conflict', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: false };
    input.hardBlocks = [
      { rule: 'FUNDING_EXTREME', reason: 'Funding above hard limit', priority: 'CRITICAL' },
    ];
    const md = buildScoreReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain(
      'Reason: HardBlocked NO but 1 hard block entry exported',
    );
    expect(md).toContain('Hard/Group Blocked: NO');
  });

  it('17.X F1 — HardBlocked YES without hard block entries is a conflict', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: 'YES' };
    const md = buildScoreReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain(
      'Reason: HardBlocked YES but no hard block entries exported',
    );
  });

  it('17.X F1 — HardBlocked flag read from market snapshot when summary lacks it', () => {
    const input = fullInput();
    input.marketSnapshot = {
      ...input.marketSnapshot,
      'Hard/Group Blocked State': false,
    };
    input.hardBlocks = [{ rule: 'MV-1', reason: 'Mandatory violation' }];
    const md = buildScoreReviewExport(input);
    expect(md).toContain(
      'Reason: HardBlocked NO but 1 hard block entry exported',
    );
  });

  it('17.X F1 — consistent HardBlocked + entries produce no conflict', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: true };
    input.hardBlocks = [
      {
        rule: 'FUNDING_EXTREME',
        reason: 'Funding above hard limit',
        priority: 'CRITICAL',
        evidence: [{ label: 'Funding', value: 0.012 }],
      },
    ];
    const md = buildScoreReviewExport(input);
    expect(md).toContain('Conflict: NO');
    expect(md).toContain('| Rule | Reason | Priority | Evidence |');
    expect(md).toContain(
      '| FUNDING_EXTREME | Funding above hard limit | CRITICAL | Funding=0.012 |',
    );
    expect(md).toContain('Hard/Group Blocked: YES');
  });

  it('17.X F2 — Decision Explanation renders copied contributions and totals', () => {
    const input = fullInput();
    input.decision = { decision: 'ENTER' };
    const md = buildScoreReviewExport(input);
    const explanation = md.slice(
      md.indexOf('# DECISION EXPLANATION'),
      md.indexOf('# DECISION POLICY'),
    );
    expect(explanation).toContain('Trend Contribution: 18');
    expect(explanation).toContain('Volume Contribution: 14');
    expect(explanation).toContain('Funding Contribution: 8');
    expect(explanation).toContain('Penalty: -4');
    expect(explanation).toContain('Bonus: 6');
    expect(explanation).toContain('Final Score: 86');
    expect(explanation).toContain('Decision: ENTER');
  });

  it('17.X F2 — missing contribution data renders UNAVAILABLE, never derived', () => {
    const md = buildScoreReviewExport({ summary: { totalScore: 8.1 } });
    const explanation = md.slice(
      md.indexOf('# DECISION EXPLANATION'),
      md.indexOf('# DECISION POLICY'),
    );
    expect(explanation).toContain('Contribution Breakdown: UNAVAILABLE');
    expect(explanation).toContain('Final Score: 8.1');
    expect(explanation).toContain('Decision: UNAVAILABLE');
  });

  it('17.X F3/F5 — Decision Policy copied verbatim when snapshot provides it', () => {
    const input = fullInput();
    input.decision = {
      decision: 'WAIT',
      decisionThreshold: '>= 9.0',
      decisionPolicy: 'SCORE_THRESHOLDS v15d',
      decisionSource: 'Score Engine',
      decisionRule: 'score < CO_THE_VAO threshold',
      decisionMapping: '8.1 → CHO_THEM',
      decisionReason: 'Score below entry threshold',
      overridden: 'NO',
    };
    const md = buildScoreReviewExport(input);
    const policy = md.slice(
      md.indexOf('# DECISION POLICY'),
      md.indexOf('# REVIEW FOCUS'),
    );
    expect(policy).toContain('Decision: WAIT');
    expect(policy).toContain('Decision Threshold: >= 9.0');
    expect(policy).toContain('Decision Policy: SCORE_THRESHOLDS v15d');
    expect(policy).toContain('Decision Source: Score Engine');
    expect(policy).toContain('Decision Rule: score < CO_THE_VAO threshold');
    expect(policy).toContain('Decision Mapping: 8.1 → CHO_THEM');
    expect(policy).toContain('Decision Reason: Score below entry threshold');
    expect(policy).toContain('Override: NO');
  });

  it('17.X F3/F5 — missing Decision Policy renders every field UNAVAILABLE', () => {
    const md = buildScoreReviewExport(fullInput());
    const policy = md.slice(
      md.indexOf('# DECISION POLICY'),
      md.indexOf('# REVIEW FOCUS'),
    );
    expect(policy).toContain('Decision Threshold: UNAVAILABLE');
    expect(policy).toContain('Decision Policy: UNAVAILABLE');
    expect(policy).toContain('Decision Source: UNAVAILABLE');
    expect(policy).toContain('Decision Mapping: UNAVAILABLE');
    expect(policy).toContain('Override: UNAVAILABLE');
    expect(policy).toContain('Override Rule: UNAVAILABLE');
  });

  it('17.X F4 — Override fields copied; override without rule is a conflict', () => {
    const withOverride = fullInput();
    withOverride.decision = {
      decision: 'WAIT',
      overridden: 'YES',
      overrideRule: 'FUNDING_EXTREME',
      overrideModule: 'Funding Module',
      overrideReason: 'Funding above hard limit',
      overrideEvidence: [{ label: 'Funding', value: 0.012 }],
    };
    const md1 = buildScoreReviewExport(withOverride);
    expect(md1).toContain('Override: YES');
    expect(md1).toContain('Override Rule: FUNDING_EXTREME');
    expect(md1).toContain('Override Module: Funding Module');
    expect(md1).toContain('Override Reason: Funding above hard limit');
    expect(md1).toContain('Override Evidence: Funding=0.012');
    expect(md1).toContain('Conflict: NO');

    const missingRule = fullInput();
    missingRule.decision = { decision: 'WAIT', overridden: true };
    const md2 = buildScoreReviewExport(missingRule);
    expect(md2).toContain('Conflict: YES');
    expect(md2).toContain(
      'Reason: Decision Override YES but Override Rule UNAVAILABLE',
    );
  });

  it('17.X — new sections deterministic, no mutation, verdict still last', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: false };
    input.hardBlocks = [{ rule: 'MV-1', reason: 'Mandatory violation' }];
    input.decision = { decision: 'WAIT', overridden: 'NO' };
    const frozen = JSON.stringify(input);
    const first = buildScoreReviewExport(input);
    const second = buildScoreReviewExport(input);
    expect(first).toBe(second);
    expect(JSON.stringify(input)).toBe(frozen);
    const verdictIndex = first.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(first.indexOf('# DECISION POLICY'));
    expect(first.slice(verdictIndex + 1)).not.toContain('\n# ');
  });
});
