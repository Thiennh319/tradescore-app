import { describe, expect, it, vi } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { SkippedSetupEntry } from '../constants/scoring';
import {
  downloadTextFile,
  exportJournalToCSV,
  exportSkippedSetupsToCSV,
} from './journalExportService';

function miniEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 't1',
    timestamp: Date.parse('2026-06-14T03:00:00.000Z'),
    symbol: 'NEARUSDT',
    accountSizeAtEntry: 32,
    market: {
      entryPrice: 2.105,
      priceAtAnalysis: 2.1,
      slippage: 0.24,
      cvdValue: 1000,
      cvdTrend: 'UP',
      volumeRatio: 1.1,
      btcChangePct: 0.5,
      fundingRate: 0.01,
      topLSRatio: 1.2,
      oiChangePct: 0.3,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 11.5,
      direction: 'LONG',
      layerScores: {
        l1: 1,
        l2: 1,
        l3: 1,
        l4: 0.5,
        l5: 1.5,
        l6: 1,
        l7: 1,
        l8: 1,
        l9: 1.5,
        l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'PULLBACK_EMA',
      entryZoneOptimal: 2.1,
      entryZoneRangeLow: 2.08,
      entryZoneRangeHigh: 2.12,
      slProposed: 2.05,
      slActual: 2.05,
      tp1Proposed: 2.2,
      tp1Actual: 2.2,
      tp2: 2.25,
      tp3: 2.3,
      rrProposed: 2,
      sizeProposed: 5,
      sizeActual: 5,
      isSafeSL: true,
    },
    outcome: {
      status: 'WIN',
      pnlUSDT: 1.57,
      exitPrice: 2.21,
      notes: 'line1\nline2, with comma',
    },
    tags: [],
    version: '1.0.2',
    ...overrides,
  };
}

describe('journalExportService', () => {
  it('exports header-only CSV when journal is empty (with UTF-8 BOM)', async () => {
    const csv = await exportJournalToCSV([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const body = csv.slice(1);
    const lines = body.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Open Reason');
    expect(lines[0]).toContain('Close Reason');
  });

  it('exports one data row with required columns', async () => {
    const csv = await exportJournalToCSV([miniEntry()]);
    expect(csv).toContain('NEARUSDT');
    expect(csv).toContain('VAO_TU_TIN');
    expect(csv).toContain('Entry Actual');
    expect(csv).toContain('positionAdvisorActionAtExit');
  });

  it('quotes fields that contain commas or newlines', async () => {
    const csv = await exportJournalToCSV([miniEntry()]);
    expect(csv).toContain('"line1\nline2, with comma"');
  });

  it('includes accountSizeAfter from history', async () => {
    const csv = await exportJournalToCSV([miniEntry()], [
      {
        timestamp: Date.now(),
        value: 33.57,
        tradeId: 't1',
        pnlUSDT: 1.57,
        symbol: 'NEARUSDT',
      },
    ]);
    expect(csv).toContain('33.57');
  });

  it('skips archived journal entries', async () => {
    const csv = await exportJournalToCSV([
      miniEntry({ id: 'keep', archived: false }),
      miniEntry({ id: 'gone', archived: true, symbol: 'BTCUSDT' }),
    ]);
    expect(csv).toContain('keep');
    expect(csv).not.toContain('gone');
    expect(csv).not.toContain('BTCUSDT');
  });

  it('exports skipped setups CSV with BOM', () => {
    const skipped: SkippedSetupEntry = {
      id: 's1',
      timestamp: Date.parse('2026-06-14T03:00:00.000Z'),
      symbol: 'SOLUSDT',
      direction: 'LONG',
      totalScore: 9,
      skipReason: 'LOW_SCORE',
      skipReasonDetail: 'score < 10',
      priceAtSkip: 140,
      version: '1',
    };
    const csv = exportSkippedSetupsToCSV([skipped]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('SOLUSDT');
    expect(csv).toContain('LOW_SCORE');
  });

  it('downloadTextFile creates a Blob download when document is available', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChild);

    downloadTextFile('x.csv', 'a,b', 'text/csv');

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
