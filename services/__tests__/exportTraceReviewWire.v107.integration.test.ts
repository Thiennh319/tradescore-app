/**
 * TASK 17.7 — V1.0.7 UI wiring validation for all 10 Trace + Review exports.
 * Does not mutate engines; only exercises the existing wire adapter.
 */

import { describe, expect, it } from 'vitest';
import type { SignalRow } from '../signalBoardScan';
import {
  exportTraceOrReviewMarkdown,
  TRACE_REVIEW_FILENAMES,
  type TraceReviewExportKind,
} from '../exportTraceReviewWire';

function frozenRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 11,
    longScore: 11,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'Có thể vào',
    winrate: '58%',
    canEnter: true,
    tradePlan: null,
    layers: [
      {
        layer: 1,
        name: 'Trend',
        score: 2,
        maxScore: 2,
        passed: true,
        isMandatory: true,
        isMandatoryViolation: false,
        reason: 'Trend aligned',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
  };
}

const ALL_KINDS = Object.keys(TRACE_REVIEW_FILENAMES) as TraceReviewExportKind[];

const REVIEW_KINDS: TraceReviewExportKind[] = [
  'review-rulebook',
  'review-score',
  'review-entry',
  'review-position',
  'review-tradeplan',
];

describe('TASK 17.7 — V1.0.7 Trace + AI Review Export wiring', () => {
  it('exports all 10 Trace + Review files with correct filenames', () => {
    const row = frozenRow();
    for (const kind of ALL_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.filename).toBe(TRACE_REVIEW_FILENAMES[kind]);
      expect(result.filename.endsWith('.md')).toBe(true);
    }
  });

  it('download payload is UTF-8 Markdown without leaks', () => {
    const row = frozenRow();
    for (const kind of ALL_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      const { markdown } = result;
      expect(markdown.length).toBeGreaterThan(100);
      expect(markdown).not.toContain('undefined');
      expect(markdown).not.toContain('\nnull\n');
      expect(markdown).not.toMatch(/\bnull\b/);
      expect(markdown).not.toContain('[object Object]');
      expect(markdown).not.toContain('{"');
      // UTF-8 round-trip
      const bytes = new TextEncoder().encode(markdown);
      expect(new TextDecoder().decode(bytes)).toBe(markdown);
      expect(markdown).toContain('#');
    }
  });

  it('Review exports keep Phase 17 workflow markers', () => {
    const row = frozenRow();
    for (const kind of REVIEW_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.markdown).toContain('# REVIEW MISSION');
      expect(result.markdown).toContain('# FINAL VERDICT');
      expect(result.markdown).toContain('# CURSOR IMPLEMENTATION PROMPT');
    }
  });

  it('all 10 exports embed AI REVIEW SPECIFICATION v1 exactly once', () => {
    const row = frozenRow();
    for (const kind of ALL_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;

      const { markdown } = result;
      expect(markdown.match(/^# AI REVIEW SPECIFICATION$/gm), kind).toHaveLength(1);
      expect(markdown, kind).toContain(
        'The exported snapshot is the ONLY source of truth.',
      );
      expect(markdown, kind).toContain(
        'INSUFFICIENT EVIDENCE',
      );
      expect(markdown, kind).toContain(
        'Missing diagnostic fields are ENHANCEMENT, NOT BUG.',
      );
      expect(markdown, kind).toContain('Gate ≠ RuleBook Rule.');
      expect(markdown, kind).toContain(
        '"Not stored in this snapshot version."',
      );
      expect(markdown, kind).toContain(
        'Review Protocol: v1 (LOCKED). See REVIEW_PROTOCOL.md.',
      );
      expect(markdown, kind).toContain('Reviewer MUST NOT skip steps.');
    }
  });

  it('Review FINAL VERDICT remains the last section after specification insertion', () => {
    const row = frozenRow();
    for (const kind of REVIEW_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;

      expect(result.markdown.lastIndexOf('# FINAL VERDICT'), kind).toBeGreaterThan(
        result.markdown.lastIndexOf('# AI REVIEW SPECIFICATION'),
      );
    }
  });

  it('Review filenames match V1.0.7 deliverables', () => {
    expect(TRACE_REVIEW_FILENAMES['review-rulebook']).toBe('RULEBOOK_REVIEW.md');
    expect(TRACE_REVIEW_FILENAMES['review-score']).toBe('SCORE_REVIEW.md');
    expect(TRACE_REVIEW_FILENAMES['review-entry']).toBe('ENTRY_REVIEW.md');
    expect(TRACE_REVIEW_FILENAMES['review-position']).toBe('POSITION_REVIEW.md');
    expect(TRACE_REVIEW_FILENAMES['review-tradeplan']).toBe('TRADEPLAN_REVIEW.md');
  });

  it('does not mutate frozen snapshot during any of the 10 exports', () => {
    const row = frozenRow();
    const before = JSON.stringify(row);
    for (const kind of ALL_KINDS) {
      exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
      });
    }
    expect(JSON.stringify(row)).toBe(before);
  });
});
