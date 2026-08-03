/**
 * TASK 17.5.2 — Rule Trace ↔ Score Trace presentation consistency.
 * Presentation only: Status / Recommendation / Dependency / Source Module.
 */

import { describe, expect, it } from 'vitest';
import type { SignalRow } from '../signalBoardScan';
import { FinalEntryStatus } from '../../types/scoring';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import {
  formatTraceDependsLine,
  layerTraceDependency,
  layerTraceRecommendation,
  layerTraceStatus,
  normalizeTraceRecommendation,
} from '../aiExport/traceLayerPresentation';

function rowWithLayers(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 9.5,
    longScore: 9.5,
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
        name: 'L1 — Giá & EMA',
        score: 1.5,
        maxScore: 1.5,
        passed: true,
        isMandatory: true,
        isMandatoryViolation: false,
        reason: 'Aligned',
      },
      {
        layer: 5,
        name: 'L5a — CVD Strength',
        score: 0.5,
        maxScore: 1.5,
        passed: false,
        isMandatory: false,
        isMandatoryViolation: false,
        reason: 'CVD weak',
      },
      {
        layer: 8,
        name: 'L8 — Funding',
        score: 0,
        maxScore: 1.5,
        passed: false,
        isMandatory: true,
        isMandatoryViolation: true,
        reason: 'Funding extreme',
      },
    ],
    mandatoryViolations: ['L8 — Funding'],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
  };
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`# ${heading}`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const next = markdown.indexOf('\n# ', start + 1);
  return next >= 0 ? markdown.slice(start, next) : markdown.slice(start);
}

function layerBlock(markdown: string, layerName: string): string {
  const marker = `\n${layerName}\n`;
  const start = markdown.indexOf(marker);
  expect(start, layerName).toBeGreaterThanOrEqual(0);
  const from = start + 1;
  const nextRule = markdown.indexOf('\nRule ', from + layerName.length);
  const nextComponent = markdown.indexOf('\nComponent ', from + layerName.length);
  const nextDivider = markdown.indexOf('\n--------------------------------', from + layerName.length);
  const candidates = [nextRule, nextComponent, nextDivider]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const end = candidates[0] ?? markdown.length;
  return markdown.slice(from, end);
}

describe('TASK 17.5.2 Trace presentation helpers', () => {
  it('uses one Status vocabulary', () => {
    expect(layerTraceStatus(true, false)).toBe('PASS');
    expect(layerTraceStatus(false, false)).toBe('WARNING');
    expect(layerTraceStatus(false, true)).toBe('FAIL');
  });

  it('uses one Recommendation wording', () => {
    expect(layerTraceRecommendation(true)).toBe('OK');
    expect(layerTraceRecommendation(false)).toBe('Review Layer');
    expect(normalizeTraceRecommendation('Review')).toBe('Review Layer');
    expect(normalizeTraceRecommendation('Review layer')).toBe('Review Layer');
    expect(normalizeTraceRecommendation('Needs Review')).toBe('Review Layer');
  });

  it('uses one Dependency format', () => {
    expect(layerTraceDependency(5, 'L5a — CVD Strength')).toBe('Layer 5');
    expect(layerTraceDependency(1, 'Giá & EMA (Slope)')).toBe('Layer 1');
    expect(
      formatTraceDependsLine('L5a — CVD Strength', 'Layer 5'),
    ).toBe('- L5a — CVD Strength depends Layer 5');
  });
});

describe('TASK 17.5.2 Rule Trace ↔ Score Trace consistency', () => {
  it('exports identical Status / Recommendation / Dependency / Source Module', () => {
    const row = rowWithLayers();
    const rule = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-19T00:00:00.000Z',
    });
    const score = exportTraceOrReviewMarkdown('trace-score', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(rule.ok).toBe(true);
    expect(score.ok).toBe(true);
    if (!rule.ok || !score.ok) return;

    const ruleL5 = layerBlock(section(rule.markdown, 'RULE TRACE'), 'L5a — CVD Strength');
    const scoreL5 = layerBlock(
      section(score.markdown, 'SCORE COMPONENTS'),
      'Name: L5a — CVD Strength',
    );
    // Soft fail (score path, non-mandatory): WARNING in both — never Rule=WARNING / Score=FAIL.
    expect(ruleL5).toContain('Status: WARNING');
    expect(scoreL5).toContain('Status: WARNING');
    expect(ruleL5).not.toContain('Status: FAIL');
    expect(scoreL5).not.toContain('Status: FAIL');
    expect(ruleL5).toContain('Recommendation: Review Layer');
    expect(scoreL5).toContain('Recommendation: Review Layer');

    const dep = 'Layer 5';
    expect(ruleL5).toContain(`Source Module: ${dep}`);
    expect(scoreL5).toContain(`Source Module: ${dep}`);
    expect(rule.markdown).toContain(`- L5a — CVD Strength depends ${dep}`);
    expect(score.markdown).toContain(`- L5a — CVD Strength depends ${dep}`);
    // SCORE DEPENDENCY must never self-reference the component name.
    expect(score.markdown).not.toContain(
      '- L5a — CVD Strength depends L5a — CVD Strength',
    );

    const ruleL8 = layerBlock(section(rule.markdown, 'RULE TRACE'), 'L8 — Funding');
    const scoreL8 = layerBlock(
      section(score.markdown, 'SCORE COMPONENTS'),
      'Name: L8 — Funding',
    );
    expect(ruleL8).toContain('Status: FAIL');
    expect(scoreL8).toContain('Status: FAIL');

    // Score=0 soft-fail path (L4-style): WARNING, never FAIL, identical in both exports.
    const softZero = {
      ...rowWithLayers(),
      layers: [
        {
          layer: 4,
          name: 'L4 — Bollinger',
          score: 0,
          maxScore: 1.5,
          passed: false,
          isMandatory: false,
          isMandatoryViolation: false,
          reason: 'Bandwidth compressed',
        },
      ],
    };
    const ruleL4 = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [softZero],
      scorerVersion: 'v4',
      exportedAt: '2026-07-19T00:00:00.000Z',
    });
    const scoreL4 = exportTraceOrReviewMarkdown('trace-score', {
      rows: [softZero],
      scorerVersion: 'v4',
      exportedAt: '2026-07-19T00:00:00.000Z',
    });
    expect(ruleL4.ok && scoreL4.ok).toBe(true);
    if (!ruleL4.ok || !scoreL4.ok) return;
    const ruleL4Block = layerBlock(section(ruleL4.markdown, 'RULE TRACE'), 'L4 — Bollinger');
    const scoreL4Block = layerBlock(
      section(scoreL4.markdown, 'SCORE COMPONENTS'),
      'Name: L4 — Bollinger',
    );
    expect(ruleL4Block).toContain('Status: WARNING');
    expect(scoreL4Block).toContain('Status: WARNING');
    expect(ruleL4Block).not.toContain('Status: FAIL');
    expect(scoreL4Block).not.toContain('Status: FAIL');
    expect(scoreL4.markdown).toContain('- L4 — Bollinger depends Layer 4');
    expect(scoreL4.markdown).not.toContain('- L4 — Bollinger depends L4 — Bollinger');
  });
});
