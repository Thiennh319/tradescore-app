/**
 * TASK 17.6 — Trace/Review wire smoke tests.
 * Verifies dispatcher calls public APIs without crashing and soft-fails
 * when no frozen snapshot exists.
 */

import { describe, expect, it } from 'vitest';
import type { SignalRow } from '../signalBoardScan';
import {
  exportTraceOrReviewMarkdown,
  REVIEW_EXPORT_UNAVAILABLE,
  TRACE_REVIEW_FILENAMES,
  type TraceReviewExportKind,
} from '../exportTraceReviewWire';

function minimalRow(): SignalRow {
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

const KINDS = Object.keys(TRACE_REVIEW_FILENAMES) as TraceReviewExportKind[];

describe('exportTraceOrReviewMarkdown (TASK 17.6)', () => {
  it('soft-fails when no frozen rows exist', () => {
    const result = exportTraceOrReviewMarkdown('review-entry', {
      rows: [],
      scorerVersion: 'v4',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(REVIEW_EXPORT_UNAVAILABLE);
      expect(result.message).toBe('No snapshot available.');
    }
  });

  it('exports all Trace + Review kinds from a frozen row', () => {
    const row = minimalRow();
    for (const kind of KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-19T00:00:00.000Z',
      });
      expect(result.ok, kind).toBe(true);
      if (result.ok) {
        expect(result.filename).toBe(TRACE_REVIEW_FILENAMES[kind]);
        expect(result.markdown.length).toBeGreaterThan(100);
        expect(result.markdown).not.toContain('undefined');
        expect(result.markdown).toContain('BTCUSDT');
      }
    }
  });

  it('Review exports include REVIEW MISSION and FINAL VERDICT', () => {
    const result = exportTraceOrReviewMarkdown('review-rulebook', {
      rows: [minimalRow()],
      scorerVersion: 'v4',
      exportedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.markdown).toContain('# REVIEW MISSION');
      expect(result.markdown).toContain('# CURSOR IMPLEMENTATION PROMPT');
      expect(result.markdown).toContain('# FINAL VERDICT');
      expect(result.filename).toBe('RULEBOOK_REVIEW.md');
    }
  });

  it('does not mutate the frozen row', () => {
    const row = minimalRow();
    const before = JSON.stringify(row);
    exportTraceOrReviewMarkdown('review-entry', {
      rows: [row],
      scorerVersion: 'v4',
    });
    expect(JSON.stringify(row)).toBe(before);
  });
});
