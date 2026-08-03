import { describe, expect, it } from 'vitest';
import {
  AI_EXPORT_FILE_NAMES,
  buildAiExport,
  buildRuleExport,
  buildSummaryExport,
  type AiExportInput,
} from '../index';

function fullInput(): AiExportInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-001',
      generatedAt: '2026-07-18T02:00:00.000Z',
      engineVersion: 'v4.1',
      analyticsVersion: 'a1.2',
      ruleVersion: 'r5.0',
      entryVersion: 'e2.1',
      positionAdviserVersion: 'p3.0',
      coin: 'BTCUSDT',
      side: 'LONG',
    },
    ruleBook: {
      totalRules: 2,
      passedRules: 1,
      failedRules: 1,
      warningRules: 0,
      rules: [
        {
          id: 'EMA_ALIGNMENT',
          title: 'EMA Alignment',
          layer: 'Trend',
          mandatory: false,
          status: 'PASS',
          score: 20,
          maxScore: 20,
          reason: 'EMA20 > EMA50 > EMA200',
          recommendation: 'Keep',
        },
        {
          id: 'FUNDING_EXTREME',
          title: 'Funding Extreme',
          layer: 'Derivatives',
          mandatory: true,
          status: 'FAIL',
          score: 0,
          maxScore: 10,
          reason: 'Funding 0.12% above limit',
          recommendation: 'Wait for funding reset',
        },
      ],
    },
    scoreEngine: {
      layers: [
        { name: 'Trend', score: 20, maxScore: 20, reason: 'Aligned' },
        { name: 'Momentum', score: 8, maxScore: 15, reason: 'RSI neutral' },
      ],
      groupScores: { trend: 20, momentum: 8 },
      totalScore: 28,
      maxScore: 35,
      grade: 'B',
      decision: 'WAIT',
    },
    entryQuality: {
      checks: [{ name: 'Spread', status: 'PASS', detail: '0.03%' }],
      entryScore: 7.5,
      entryDecision: 'ACCEPTABLE',
      reason: 'Spread tight, volume ok',
    },
    positionAdviser: {
      positionState: 'OPEN',
      advice: 'HOLD',
      riskLevel: 'MEDIUM',
      actions: [{ priority: 'HIGH', action: 'Move SL to breakeven', reason: 'TP1 reached' }],
    },
    tradePlan: {
      entryPrice: 106150,
      stopLoss: 105400,
      takeProfits: [107200, 108000],
      riskReward: 2.5,
      positionSize: 0.5,
      invalidation: 'Close below 105400',
      planNotes: ['Scale out 50% at TP1'],
    },
    marketSnapshot: {
      symbol: 'BTCUSDT',
      timeframe: '1H',
      categories: {
        trend: { ema20: 106210, ema50: 105900, ema200: 104800 },
        derivatives: { fundingRate: 0.008, openInterest: 245000000 },
      },
    },
    signalDecision: {
      decision: 'WAIT',
      direction: 'LONG',
      confidence: 0.62,
      hardBlocked: true,
      blockedReasons: ['Funding extreme'],
      flow: [{ step: 'Hard Block Check', result: 'BLOCKED', detail: 'Funding 0.12%' }],
    },
    ulAnalytics: {
      metrics: [{ label: 'Winrate 30d', value: '58%' }],
      insights: ['LONG setups outperform in trending sessions'],
    },
    journal: {
      entries: [
        { tradeId: 'T-000', coin: 'ETHUSDT', side: 'SHORT', result: 'WIN', pnl: 120, note: 'Clean' },
      ],
    },
    summary: {
      overallDecision: 'WAIT',
      keyFindings: ['Mandatory funding rule blocks entry'],
      openQuestions: ['Should funding limit be 0.10%?'],
    },
  };
}

const EXPECTED_FILE_NAMES = [
  'README.md',
  '01_RULEBOOK.md',
  '02_SCORE_ENGINE.md',
  '03_ENTRY_QUALITY.md',
  '04_POSITION_ADVISER.md',
  '05_TRADE_PLAN.md',
  '06_MARKET_SNAPSHOT.md',
  '07_SIGNAL_DECISION.md',
  '08_UL_ANALYTICS.md',
  '09_JOURNAL.md',
  '10_SUMMARY.md',
];

const STANDARD_SECTIONS = [
  '# Metadata',
  '# INPUT',
  '# ANALYSIS',
  '# DECISION',
  '# OUTPUT',
  '# CHECKLIST',
  '# WARNINGS',
  '# NOTES',
  '# AI REVIEW',
];

describe('TASK 16.0 AI Export Framework', () => {
  it('Export Empty — builds all files without crashing, marks data UNAVAILABLE', () => {
    const out = buildAiExport({});

    expect(out.version).toBe(1);
    expect(out.files.map((f) => f.fileName)).toEqual(EXPECTED_FILE_NAMES);
    for (const file of out.files) {
      expect(file.markdown.length).toBeGreaterThan(0);
    }
    const ruleDoc = out.files.find((f) => f.fileName === '01_RULEBOOK.md');
    expect(ruleDoc?.markdown).toContain('UNAVAILABLE');
  });

  it('Export Full — every domain value appears in its own file', () => {
    const out = buildAiExport(fullInput());
    const byName = new Map(out.files.map((f) => [f.fileName, f.markdown]));

    expect(byName.get('01_RULEBOOK.md')).toContain('FUNDING_EXTREME');
    expect(byName.get('01_RULEBOOK.md')).toContain('Mandatory rule failed: FUNDING_EXTREME');
    expect(byName.get('02_SCORE_ENGINE.md')).toContain('Total Score: 28');
    expect(byName.get('03_ENTRY_QUALITY.md')).toContain('Entry Decision: ACCEPTABLE');
    expect(byName.get('04_POSITION_ADVISER.md')).toContain('Move SL to breakeven');
    expect(byName.get('05_TRADE_PLAN.md')).toContain('Take Profit 2: 108000');
    expect(byName.get('06_MARKET_SNAPSHOT.md')).toContain('ema20: 106210');
    expect(byName.get('07_SIGNAL_DECISION.md')).toContain('Decision: WAIT');
    expect(byName.get('08_UL_ANALYTICS.md')).toContain('Winrate 30d');
    expect(byName.get('09_JOURNAL.md')).toContain('ETHUSDT');
    expect(byName.get('10_SUMMARY.md')).toContain('Overall Decision: WAIT');
  });

  it('One file = one domain — rule data never leaks into other files', () => {
    const out = buildAiExport(fullInput());
    for (const file of out.files) {
      if (file.fileName === '01_RULEBOOK.md' || file.fileName === 'README.md') continue;
      expect(file.markdown).not.toContain('FUNDING_EXTREME');
    }
  });

  it('Markdown Format — every domain file has all standard sections in order', () => {
    const out = buildAiExport(fullInput());
    for (const file of out.files) {
      if (file.fileName === 'README.md') continue;
      let lastIndex = -1;
      for (const heading of STANDARD_SECTIONS) {
        const idx = file.markdown.indexOf(`${heading}\n`);
        expect(idx, `${file.fileName} missing ${heading}`).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
      expect(file.markdown).toContain('AI REVIEW CHECKLIST');
      expect(file.markdown).toContain('Rule conflict? YES / NO');
      expect(file.markdown).toContain('Decision reasonable? YES / NO');
    }
  });

  it('Metadata Contract — required metadata lines exist in every domain file', () => {
    const out = buildAiExport(fullInput());
    const required = [
      'Version:',
      'Export Version:',
      'Trade ID: T-2026-0718-001',
      'Generated Time: 2026-07-18T02:00:00.000Z',
      'Engine Version: v4.1',
      'Analytics Version: a1.2',
      'Rule Version: r5.0',
      'Entry Version: e2.1',
      'Position Adviser Version: p3.0',
      'Coin: BTCUSDT',
      'Side: LONG',
    ];
    for (const file of out.files) {
      if (file.fileName === 'README.md') continue;
      for (const line of required) {
        expect(file.markdown, `${file.fileName} missing "${line}"`).toContain(line);
      }
    }
  });

  it('Stable Output — same input produces byte-identical exports', () => {
    const a = buildAiExport(fullInput());
    const b = buildAiExport(fullInput());
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('No JSON Dump — no raw object serialization in any file', () => {
    for (const input of [{}, fullInput()]) {
      const out = buildAiExport(input);
      for (const file of out.files) {
        expect(file.markdown).not.toContain('[object Object]');
        expect(file.markdown).not.toContain('":');
        expect(file.markdown).not.toContain('{"');
      }
    }
  });

  it('No Undefined / No Null — literal words never leak into output', () => {
    for (const input of [{}, fullInput(), { ruleBook: { rules: [{}] } } as AiExportInput]) {
      const out = buildAiExport(input);
      for (const file of out.files) {
        expect(file.markdown).not.toMatch(/\bundefined\b/);
        expect(file.markdown).not.toMatch(/\bnull\b/);
      }
    }
  });

  it('README Exists — explains reading order, file meaning and export flow', () => {
    const out = buildAiExport({});
    const readme = out.files.find((f) => f.fileName === AI_EXPORT_FILE_NAMES.readme);

    expect(readme).toBeDefined();
    expect(readme?.markdown).toContain('Reading Order');
    expect(readme?.markdown).toContain('File Meaning');
    expect(readme?.markdown).toContain('Export Flow');
    expect(readme?.markdown).toContain('01_RULEBOOK.md');
    expect(readme?.markdown).toContain('10_SUMMARY.md');
  });

  it('Deterministic — no wall-clock time is used (Generated Time from input only)', () => {
    const doc = buildRuleExport({});
    expect(doc).toContain('Generated Time: UNAVAILABLE');
    const year = String(new Date().getFullYear());
    expect(doc).not.toContain(`Generated Time: ${year}`);
  });

  it('Read-only — input is not mutated by building the export', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    buildAiExport(input);
    buildSummaryExport(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('Summary — reports missing domains as partial review warnings', () => {
    const out = buildAiExport({ summary: { overallDecision: 'WAIT' } });
    const summary = out.files.find((f) => f.fileName === '10_SUMMARY.md');
    expect(summary?.markdown).toContain('RuleBook was not provided');
    expect(summary?.markdown).toContain('Journal was not provided');
  });
});
