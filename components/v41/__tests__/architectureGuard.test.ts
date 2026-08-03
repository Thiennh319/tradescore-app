/**
 * Architecture guard — Task 9.5.
 * Production UI path must not depend on RC3 fixtures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Task 9.5 — V4.1 UI architecture guards', () => {
  it('V41BoardRC3 does not import fixtures', () => {
    const src = readSrc('components/v41/V41BoardRC3.tsx');
    expect(src).not.toMatch(/rc3LayoutFixtures/);
    expect(src).not.toMatch(/RC3_LAYOUT_FIXTURES/);
    expect(src).not.toMatch(/useLayoutFixtures/);
  });

  it('V41SignalPanel / Card / Monitor do not import fixtures', () => {
    for (const rel of [
      'components/v41/V41SignalPanel.tsx',
      'components/v41/V41SignalCard.tsx',
      'components/v41/V41ExecutionMonitor.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/rc3LayoutFixtures|RC3_LAYOUT_FIXTURES/);
    }
  });

  it('buildRc3Cards has no trading / indicator logic', () => {
    const src = readSrc('components/v41/buildRc3Cards.ts');
    // Strip block comments before scanning for banned computation APIs.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/computeDecision|computeConfidence|computeTrade|evaluateTrend|binance|fetchTicker|scanV41\(/i);
    expect(code).not.toMatch(/marketConfidence|snapshot\.|atr\b|ema\b|whale/i);
    expect(code).toMatch(/buildRc3Cards/);
    expect(code).toMatch(/buildEmptyRc3Card/);
  });

  it('RC3 UI components do not call engines or Binance', () => {
    for (const rel of [
      'components/v41/V41BoardRC3.tsx',
      'components/v41/V41SignalPanel.tsx',
      'components/v41/V41SignalCard.tsx',
      'components/v41/V41ExecutionMonitor.tsx',
      'components/v41/buildRc3Cards.ts',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/from ['"].*binanceApi/);
      expect(src).not.toMatch(/computeDecisionEngineResult|computeConfidenceEngineResult|computeTradeExecutionPlannerResult|evaluateTrendReversal/);
      expect(src).not.toMatch(/scanV41\(/);
    }
  });

  it('App wires live ViewModel — no fixture import', () => {
    const src = readSrc('App.tsx');
    expect(src).not.toMatch(/rc3LayoutFixtures/);
    expect(src).not.toMatch(/RC3_LAYOUT_FIXTURES/);
    expect(src).toMatch(/v41Cards/);
    expect(src).not.toMatch(/buildRc3ViewModelsFromScan/);
  });

  it('UI RC3 board / Execution Monitor do not import Core engines', () => {
    for (const rel of [
      'components/v41/V41BoardRC3.tsx',
      'components/v41/V41ExecutionMonitor.tsx',
      'components/v41/V41SignalCard.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(
        /evaluatePositionV41|computeDecision|computeConfidence|planTradeExecution|buildTradeSessionAdviser/,
      );
    }
  });
});
