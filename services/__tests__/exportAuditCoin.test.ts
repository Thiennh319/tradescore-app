import { describe, expect, it } from 'vitest';
import { TRADE_SYMBOLS, type AppTradeSymbol } from '../../constants/scoring';
import type { SignalRow } from '../signalBoardScan';
import {
  AUDIT_EXPORT_COIN_BRAND,
  AUDIT_EXPORT_COIN_OPTIONS,
  auditExportCoinDotColor,
  auditExportCoinLabel,
  exportFilenameForCoin,
  resolveExportCoinGate,
  resolveExportCoins,
  resolveHealthyExportCoins,
} from '../exportAuditCoin';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

function row(symbol: AppTradeSymbol, error?: string): SignalRow {
  return {
    symbol,
    price: 1,
    change24h: 0,
    trend: 'BULLISH',
    regimeConfidence: 0.5,
    score: 10,
    longScore: 10,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'Có thể vào',
    winrate: '55%',
    canEnter: true,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    error,
  };
}

describe('exportAuditCoin helpers', () => {
  it('tree options: Tất cả + TRADE_SYMBOLS with brand colors', () => {
    expect(AUDIT_EXPORT_COIN_OPTIONS.map((o) => o.id)).toEqual([
      'ALL',
      'BTCUSDT',
      'NEARUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
    ]);
    expect(AUDIT_EXPORT_COIN_BRAND.BTCUSDT).toBe('#F7931A');
    expect(AUDIT_EXPORT_COIN_BRAND.NEARUSDT).toBe('#00C08B');
    expect(AUDIT_EXPORT_COIN_BRAND.SOLUSDT).toBe('#9945FF');
    expect(AUDIT_EXPORT_COIN_BRAND.BNBUSDT).toBe('#F0B90B');
    expect(AUDIT_EXPORT_COIN_BRAND.XRPUSDT).toBe('#23292F');
    expect(auditExportCoinLabel('ALL')).toBe('Tất cả coin');
    expect(auditExportCoinLabel('NEARUSDT')).toBe('NEAR');
    expect(auditExportCoinLabel('XRPUSDT')).toBe('XRP');
    expect(auditExportCoinDotColor('ALL')).toBe('#848E9C');
  });

  it('resolveExportCoins: ALL → TRADE_SYMBOLS; single → one', () => {
    expect(resolveExportCoins('ALL')).toEqual([...TRADE_SYMBOLS]);
    expect(resolveExportCoins('SOLUSDT')).toEqual(['SOLUSDT']);
  });

  it('exportFilenameForCoin suffixes before extension', () => {
    expect(exportFilenameForCoin('01_RULEBOOK.md', 'NEARUSDT')).toBe(
      '01_RULEBOOK_NEARUSDT.md',
    );
    expect(exportFilenameForCoin('TRADESCORE_RULE_SCORE_BUNDLE.md', 'BTCUSDT')).toBe(
      'TRADESCORE_RULE_SCORE_BUNDLE_BTCUSDT.md',
    );
  });

  it('gate: loading / empty / single error / ALL healthy', () => {
    expect(resolveExportCoinGate('ALL', [], true).disabled).toBe(true);
    expect(resolveExportCoinGate('ALL', [], false).disabled).toBe(true);

    const nearErr = [row('NEARUSDT', 'timeout')];
    const gNear = resolveExportCoinGate('NEARUSDT', nearErr, false);
    expect(gNear.disabled).toBe(true);
    expect(gNear.reason).toMatch(/NEAR/);

    const allSymbols = TRADE_SYMBOLS.map((s) => row(s));
    expect(resolveExportCoinGate('ALL', allSymbols, false).disabled).toBe(false);
    expect(resolveExportCoinGate('BNBUSDT', allSymbols, false).disabled).toBe(false);
  });

  it('resolveHealthyExportCoins skips errored when ALL', () => {
    const rows = [
      row('BTCUSDT'),
      row('NEARUSDT', 'fail'),
      row('SOLUSDT'),
      row('BNBUSDT'),
    ];
    expect(resolveHealthyExportCoins('ALL', rows)).toEqual([
      'BTCUSDT',
      'SOLUSDT',
      'BNBUSDT',
    ]);
  });
});

describe('exportTraceOrReviewMarkdown + context.coin', () => {
  const kinds = [
    'trace-rulebook',
    'trace-score',
    'trace-entry',
    'trace-position',
    'trace-tradeplan',
  ] as const;

  it('forces Coin metadata to selected symbol (not BTC-first default)', () => {
    const rows = [
      row('BTCUSDT'),
      row('NEARUSDT'),
      row('SOLUSDT'),
      row('BNBUSDT'),
    ];
    // Without coin, BTC is first enterable → BTCUSDT
    const def = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows,
      scorerVersion: 'v4',
    });
    expect(def.ok).toBe(true);
    if (def.ok) expect(def.markdown).toMatch(/^Coin:\s*BTCUSDT$/m);

    for (const coin of ['NEARUSDT', 'SOLUSDT', 'BNBUSDT'] as const) {
      for (const kind of kinds) {
        const result = exportTraceOrReviewMarkdown(kind, {
          rows,
          scorerVersion: 'v4',
          coin,
          exportedAt: '2026-07-22T00:00:00.000Z',
        });
        expect(result.ok, `${coin} ${kind}`).toBe(true);
        if (result.ok) {
          expect(result.markdown).toMatch(new RegExp(`^Coin:\\s*${coin}$`, 'm'));
          expect(result.markdown).not.toMatch(/^Coin:\s*BTCUSDT$/m);
        }
      }
    }
  });

  it('ALL selection loop exports TRADE_SYMBOLS.count distinct Coin lines', () => {
    const rows = TRADE_SYMBOLS.map((s) => row(s));
    const coins = resolveHealthyExportCoins('ALL', rows);
    expect(coins).toHaveLength(TRADE_SYMBOLS.length);
    for (const coin of coins) {
      const result = exportTraceOrReviewMarkdown('trace-score', {
        rows,
        scorerVersion: 'v4',
        coin,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.markdown).toMatch(new RegExp(`^Coin:\\s*${coin}$`, 'm'));
      }
    }
  });
});
