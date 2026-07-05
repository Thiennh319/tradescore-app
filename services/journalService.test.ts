import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { FundingState } from '../constants/scoring';
import {
  buildAdxJournalSnapshot,
  buildMarketSnapshot,
  buildEquityCurveData,
  buildScoringSnapshot,
  buildSnapshotsFromSignalRow,
  calculateDailyStats,
  calculateEntryQuality,
  calculateLayerAccuracy,
  computeEquityCurveStats,
  computeSlippagePct,
  computeTradePnl,
  clearInsightCache,
  fundingAtEntryFromL6Detail,
  generateAllInsights,
  getLayerAccuracyInsights,
  getTimePatternInsight,
  getWinRateByScoreRange,
  inferSessionType,
  isStatsEligibleOutcome,
  newAiJournalEntry,
  newAiJournalPendingEntry,
  outcomeFromClose,
  rebuildAccountHistoryFromJournal,
  resolveSqueezeExitPatchForClose,
  squeezeAtEntryFromResult,
} from './journalService';
import { migrateAiJournalEntry } from './phase1Migration';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const base = newAiJournalEntry({
    symbol: 'NEARUSDT',
    accountSizeAtEntry: 1000,
    market: buildMarketSnapshot({
      entryPrice: 5,
      priceAtAnalysis: 4.95,
      cvdTrend: 'UP',
    }),
    scoring: buildScoringSnapshot({
      totalScore: 10.5,
      direction: 'LONG',
      layers: [{ layer: 1, name: 'L1', score: 1.5, maxScore: 1.5, passed: true, isMandatory: true, isMandatoryViolation: false, reason: 'ok' }],
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    }),
    plan: {
      entryZoneType: 'PULLBACK_EMA',
      entryZoneOptimal: 4.98,
      entryZoneRangeLow: 4.9,
      entryZoneRangeHigh: 5.05,
      slProposed: 4.7,
      slActual: 4.7,
      tp1Proposed: 5.3,
      tp1Actual: 5.3,
      tp2: 5.5,
      tp3: 5.8,
      rrProposed: 2,
      sizeProposed: 50,
      sizeActual: 50,
      isSafeSL: true,
    },
  });
  return {
    ...base,
    ...overrides,
    market: { ...base.market, ...overrides.market },
    scoring: { ...base.scoring, ...overrides.scoring, layerScores: { ...base.scoring.layerScores, ...overrides.scoring?.layerScores } },
    plan: { ...base.plan, ...overrides.plan },
    outcome: { ...base.outcome, ...overrides.outcome },
  };
}

describe('journalService', () => {
  it('computes slippage percent', () => {
    expect(computeSlippagePct(101, 100)).toBe(1);
  });

  it('infers session type from hour', () => {
    expect(inferSessionType(10)).toBe('GOOD');
    expect(inferSessionType(3)).toBe('BAD');
  });

  it('calculates layer accuracy for wins with high layer score', () => {
    const win = sampleEntry({
      outcome: { status: 'WIN', pnlUSDT: 10 },
    });
    win.scoring.layerScores.l1 = 1.2;
    const loss = sampleEntry({
      outcome: { status: 'LOSS', pnlUSDT: -5 },
    });
    loss.scoring.layerScores.l1 = 1.2;
    const acc = calculateLayerAccuracy([win, loss]);
    expect(acc.l1).toBe(50);
  });

  it('groups win rate by score range', () => {
    const entries = [
      sampleEntry({ scoring: { ...sampleEntry().scoring, totalScore: 8.5 }, outcome: { status: 'WIN', pnlUSDT: 5 } }),
      sampleEntry({ scoring: { ...sampleEntry().scoring, totalScore: 11 }, outcome: { status: 'LOSS', pnlUSDT: -3 } }),
    ];
    const ranges = getWinRateByScoreRange(entries);
    expect(ranges.some((r) => r.trades > 0)).toBe(true);
  });

  it('calculates entry quality in range', () => {
    const entry = sampleEntry({
      market: { ...sampleEntry().market, entryPrice: 4.98 },
      outcome: { status: 'WIN', pnlUSDT: 8 },
    });
    const q = calculateEntryQuality(entry);
    expect(q.score).toBeGreaterThan(50);
  });

  it('builds daily stats', () => {
    const entry = sampleEntry({
      timestamp: Date.parse('2026-06-13T03:00:00.000Z'),
      outcome: outcomeFromClose({
        exitPrice: 5.1,
        pnlUSDT: 12,
        pnlPct: 2,
        entryTimestamp: Date.parse('2026-06-13T02:00:00.000Z'),
      }),
    });
    const stats = calculateDailyStats([entry], '2026-06-13');
    expect(stats.totalTrades).toBe(1);
    expect(stats.wins).toBe(1);
  });

  it('builds snapshots from signal row', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: {
        symbol: 'NEARUSDT',
        direction: 'LONG',
        score: 11.2,
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'Vào tự tin',
        layers: [],
        mandatoryViolations: [],
        price: 2.1,
        change24h: 1.5,
        tradePlan: {
          direction: 'LONG',
          entryPrice: 2.1,
          stopLoss: 2.05,
          takeProfit1: 2.2,
          takeProfit2: 2.25,
          takeProfit3: 2.3,
          positionSize: 50,
          marginRequired: 5,
          notional: 50,
          riskAmount: 1,
          atrMultiplier: 2,
          rrRatios: [1, 2, 3],
          notes: '',
        },
      } as import('../services/signalBoardScan').SignalRow,
      entryPrice: 2.105,
      stopLoss: 2.05,
      takeProfit1: 2.2,
      sizeActual: 5,
    });
    expect(snapshots.market.entryPrice).toBe(2.105);
    expect(snapshots.scoring.totalScore).toBe(11.2);
    expect(snapshots.plan.sizeActual).toBe(5);
    expect(snapshots.fundingAtEntry.fundingAtEntry).toBeNull();
  });

  it('builds V4 funding snapshot from l6Detail', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        score: 11,
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'Vào',
        layers: [],
        mandatoryViolations: [],
        price: 100,
        change24h: 1,
        l6Detail: {
          fundingCurrent: -0.008,
          fundingAvg8: -0.006,
          fundingVelocity: -0.002,
          fundingAcceleration: 0,
          fundingState: FundingState.SHORT_SQUEEZE_BUILDING,
          isFallback: false,
        },
        v4: {
          score: 11,
          longScore: 11,
          shortScore: 5,
          direction: 'LONG',
          decisionLabel: 'VAO_TU_TIN',
          decisionDisplay: 'Vào',
          winrate: '70%',
          canEnter: true,
          layers: [],
          mandatoryViolations: [],
          hardBlocked: false,
        },
      } as import('../services/signalBoardScan').SignalRow,
      entryPrice: 100,
      sizeActual: 6,
      planSource: 'v4',
      scorerVersion: 'v4',
    });
    expect(snapshots.fundingAtEntry.fundingAtEntry).toBeCloseTo(-0.008);
    expect(snapshots.fundingAtEntry.fundingVelocityAtEntry).toBeCloseTo(-0.002);
    expect(snapshots.fundingAtEntry.fundingStateAtEntry).toBe(
      FundingState.SHORT_SQUEEZE_BUILDING,
    );
  });

  it('fundingAtEntryFromL6Detail returns null for V3', () => {
    expect(
      fundingAtEntryFromL6Detail(
        {
          fundingCurrent: 0.01,
          fundingAvg8: 0.01,
          fundingVelocity: 0,
          fundingAcceleration: 0,
          fundingState: FundingState.EXTREME_LONG_EUPHORIA,
          isFallback: false,
        },
        'v3',
      ).fundingStateAtEntry,
    ).toBeNull();
  });

  it('builds snapshots from V3 plan when planSource is v3', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: {
        symbol: 'NEARUSDT',
        direction: 'LONG',
        score: 8,
        decisionLabel: 'CO_THE_VAO',
        layers: [],
        mandatoryViolations: [],
        price: 2.1,
        change24h: 1.5,
        tradePlan: {
          direction: 'LONG',
          entryPrice: 2.0,
          stopLoss: 1.95,
          takeProfit1: 2.15,
          takeProfit2: 2.2,
          takeProfit3: 2.25,
          positionSize: 40,
          marginRequired: 4,
          notional: 40,
          riskAmount: 1,
          atrMultiplier: 2,
          rrRatios: [1, 2, 3],
          notes: 'v2',
        },
        v3: {
          score: 12.5,
          longScore: 12.5,
          shortScore: 6,
          direction: 'LONG',
          decisionLabel: 'VAO_TU_TIN',
          decisionDisplay: 'Vào tự tin',
          winrate: '~65%',
          canEnter: true,
          layers: [{ layerNumber: 1, name: 'L1', score: 1.2, maxScore: 1.5, passed: true }],
          mandatoryViolations: [],
          hardBlocked: false,
        },
        tradePlanV3: {
          symbol: 'NEARUSDT',
          direction: 'LONG',
          generatedAt: Date.now(),
          totalScore: 12.5,
          decision: 'VAO_TU_TIN',
          marketMode: 'TRENDING',
          groupScores: { A: 4, B: 4, C: 4.5 },
          entryZone: {
            optimal: 2.08,
            aggressive: 2.09,
            conservative: 2.05,
            rangeLow: 2.04,
            rangeHigh: 2.1,
            quality: 'GOOD',
            distanceFromCurrentPct: -0.5,
            reasoning: 'Pullback về EMA20 1H',
            entryType: 'LIMIT_NEAR',
          },
          recommendedEntry: 2.08,
          stopLoss: {
            price: 2.02,
            type: 'ATR',
            atrDistance: 1.5,
            distancePct: 2.9,
            maxLossUSDT: 1.2,
            isProtectedByWall: true,
            reasoning: 'SL sau wall',
            quality: 'NORMAL',
          },
          tp1: { price: 2.15, rrRatio: 1.2, type: 'RR', sizeToClose: 0.4, expectedPnlUSDT: 1, reasoning: '', probability: 0.6 },
          tp2: { price: 2.22, rrRatio: 2, type: 'RR', sizeToClose: 0.35, expectedPnlUSDT: 2, reasoning: '', probability: 0.4 },
          tp3: { price: 2.3, rrRatio: 3, type: 'RR', sizeToClose: 0.25, expectedPnlUSDT: 3, reasoning: '', probability: 0.2 },
          positionSize: 5,
          positionSizeAdjusted: 4.5,
          notionalValue: 45,
          primaryRR: 1.2,
          expectedValueUSDT: 0.5,
          winProbabilityEstimate: 0.55,
          riskRewardScore: 72,
          isValid: true,
          warnings: [],
          blockReasons: [],
        },
      } as import('../services/signalBoardScan').SignalRow,
      entryPrice: 2.08,
      stopLoss: 2.02,
      takeProfit1: 2.15,
      sizeActual: 4.5,
      planSource: 'v3',
    });
    expect(snapshots.scoring.totalScore).toBe(12.5);
    expect(snapshots.scoring.decision).toBe('VAO_TU_TIN');
    expect(snapshots.plan.tp2).toBe(2.22);
    expect(snapshots.plan.tp3).toBe(2.3);
    expect(snapshots.plan.isSafeSL).toBe(true);
    expect(snapshots.plan.sizeProposed).toBe(4.5);
  });

  it('computes trade pnl for long and short (margin × price move × leverage)', () => {
    const long = sampleEntry({
      scoring: { ...sampleEntry().scoring, direction: 'LONG' },
      market: { ...sampleEntry().market, entryPrice: 100 },
      plan: { ...sampleEntry().plan, sizeActual: 10 },
    });
    expect(computeTradePnl(long, 110).pnlUSDT).toBe(5);
    expect(computeTradePnl(long, 110).pnlPct).toBe(50);
    const short = sampleEntry({
      scoring: { ...sampleEntry().scoring, direction: 'SHORT' },
      market: { ...sampleEntry().market, entryPrice: 100 },
      plan: { ...sampleEntry().plan, sizeActual: 10 },
    });
    expect(computeTradePnl(short, 90).pnlUSDT).toBe(5);
    expect(computeTradePnl(short, 90).pnlPct).toBe(50);
  });

  it('creates pending journal entry with limit fields', () => {
    const base = sampleEntry();
    const pending = newAiJournalPendingEntry({
      symbol: 'NEARUSDT',
      accountSizeAtEntry: 32,
      market: base.market,
      scoring: base.scoring,
      plan: base.plan,
      limitOrderPrice: 2.105,
    });
    expect(pending.outcome.status).toBe('PENDING');
    expect(pending.outcome.limitOrderPrice).toBe(2.105);
    expect(pending.outcome.limitOrderPlacedAt).toBeDefined();
    expect(pending.market.entryPrice).toBe(2.105);
  });

  it('excludes pending from stats eligibility', () => {
    const pending = newAiJournalPendingEntry({
      symbol: 'NEARUSDT',
      accountSizeAtEntry: 32,
      market: sampleEntry().market,
      scoring: sampleEntry().scoring,
      plan: sampleEntry().plan,
      limitOrderPrice: 2.1,
    });
    expect(isStatsEligibleOutcome(pending.outcome.status)).toBe(false);
  });

  it('generateAllInsights requires minimum closed trades', () => {
    clearInsightCache();
    const r = generateAllInsights([], { bypassCache: true });
    expect(r.hasEnoughData).toBe(false);
    expect(r.missingDataMessage).toContain('Cần thêm');
  });

  it('detects weak layer accuracy insight', () => {
    clearInsightCache();
    const entries = Array.from({ length: 6 }, (_, i) => {
      const e = sampleEntry({
        outcome: outcomeFromClose({
          exitPrice: 5.1,
          pnlUSDT: i < 2 ? 5 : -3,
          pnlPct: i < 2 ? 2 : -2,
          entryTimestamp: Date.now(),
        }),
        market: { ...sampleEntry().market, hourVN: 9 },
      });
      e.scoring.layerScores.l4 = 1.2;
      return e;
    });
    const layerInsights = getLayerAccuracyInsights(entries);
    expect(layerInsights.some((x) => x.type === 'LAYER' && x.isWarning)).toBe(true);
  });

  it('detects time pattern when win rate differs enough', () => {
    const morning = Array.from({ length: 5 }, () =>
      sampleEntry({
        timestamp: Date.parse('2026-06-13T01:00:00.000Z'),
        market: { ...sampleEntry().market, hourVN: 8 },
        outcome: outcomeFromClose({
          exitPrice: 5.2,
          pnlUSDT: 5,
          pnlPct: 2,
          entryTimestamp: Date.now(),
        }),
      }),
    );
    const afternoon = Array.from({ length: 5 }, () =>
      sampleEntry({
        timestamp: Date.parse('2026-06-13T07:00:00.000Z'),
        market: { ...sampleEntry().market, hourVN: 15 },
        outcome: outcomeFromClose({
          exitPrice: 4.8,
          pnlUSDT: -4,
          pnlPct: -2,
          entryTimestamp: Date.now(),
        }),
      }),
    );
    const insight = getTimePatternInsight([...morning, ...afternoon]);
    expect(insight?.type).toBe('TIME');
    expect(insight?.finding).toContain('Win rate');
  });

  it('generateAllInsights caches results', () => {
    clearInsightCache();
    const entries = Array.from({ length: 5 }, () =>
      sampleEntry({
        outcome: outcomeFromClose({
          exitPrice: 5.2,
          pnlUSDT: 3,
          pnlPct: 1,
          entryTimestamp: Date.now(),
        }),
      }),
    );
    const a = generateAllInsights(entries);
    const b = generateAllInsights(entries);
    expect(a).toBe(b);
  });

  it('rebuildAccountHistoryFromJournal tracks balance after each close', () => {
    const e1 = sampleEntry({
      id: 't1',
      accountSizeAtEntry: 32,
      outcome: outcomeFromClose({
        exitPrice: 5.2,
        pnlUSDT: 2,
        pnlPct: 6,
        entryTimestamp: Date.now(),
        exitTimestamp: Date.now() + 1000,
      }),
    });
    const e2 = sampleEntry({
      id: 't2',
      accountSizeAtEntry: 34,
      outcome: outcomeFromClose({
        exitPrice: 4.8,
        pnlUSDT: -1,
        pnlPct: -3,
        entryTimestamp: Date.now() + 2000,
        exitTimestamp: Date.now() + 3000,
      }),
    });
    const history = rebuildAccountHistoryFromJournal([e1, e2]);
    expect(history).toHaveLength(2);
    expect(history[0].value).toBe(34);
    expect(history[1].value).toBe(33);
  });

  it('computeEquityCurveStats calculates drawdown and progress', () => {
    const history = rebuildAccountHistoryFromJournal([
      sampleEntry({
        id: 'a',
        accountSizeAtEntry: 30,
        outcome: outcomeFromClose({
          exitPrice: 5.1,
          pnlUSDT: 2,
          pnlPct: 5,
          entryTimestamp: Date.now(),
        }),
      }),
      sampleEntry({
        id: 'b',
        accountSizeAtEntry: 32,
        outcome: outcomeFromClose({
          exitPrice: 4.9,
          pnlUSDT: -4,
          pnlPct: -8,
          entryTimestamp: Date.now() + 1000,
          exitTimestamp: Date.now() + 2000,
        }),
      }),
    ]);
    const stats = computeEquityCurveStats(history, 100);
    expect(stats?.startValue).toBe(32);
    expect(stats?.currentValue).toBe(28);
    expect(stats?.maxDrawdown).toBeGreaterThan(0);
    expect(stats?.targetValue).toBe(100);
  });

  it('buildEquityCurveData returns chart series', () => {
    const history = rebuildAccountHistoryFromJournal([
      sampleEntry({
        outcome: outcomeFromClose({
          exitPrice: 5.2,
          pnlUSDT: 1,
          pnlPct: 2,
          entryTimestamp: Date.now(),
        }),
      }),
    ]);
    const data = buildEquityCurveData(history);
    expect(data?.chartPoints).toHaveLength(1);
    expect(data?.targetLine).toBe(100);
    expect(data?.baselineLine).toBe(history[0].value);
  });
});

describe('L11 squeeze journal fields', () => {
  it('entry EXTREME squeeze at entry — persist qua newAiJournalEntry', () => {
    const entry = newAiJournalEntry({
      symbol: 'NEARUSDT',
      accountSizeAtEntry: 1000,
      market: buildMarketSnapshot({
        entryPrice: 5,
        priceAtAnalysis: 4.95,
        cvdTrend: 'UP',
      }),
      scoring: buildScoringSnapshot({
        totalScore: 10.5,
        direction: 'LONG',
        layers: [
          {
            layer: 1,
            name: 'L1',
            score: 1.5,
            maxScore: 1.5,
            passed: true,
            isMandatory: true,
            isMandatoryViolation: false,
            reason: 'ok',
          },
        ],
        mandatoryViolations: [],
        decision: 'VAO_TU_TIN',
        scorerVersion: 'v4',
      }),
      plan: {
        entryZoneType: 'PULLBACK_EMA',
        entryZoneOptimal: 4.98,
        entryZoneRangeLow: 4.9,
        entryZoneRangeHigh: 5.05,
        slProposed: 4.7,
        slActual: 4.7,
        tp1Proposed: 5.3,
        tp1Actual: 5.3,
        tp2: 5.5,
        tp3: 5.8,
        rrProposed: 2,
        sizeProposed: 50,
        sizeActual: 50,
        isSafeSL: true,
      },
      squeezeRiskScoreAtEntry: 10,
      squeezeRiskLevelAtEntry: 'EXTREME',
      squeezeRiskDirectionAtEntry: 'LONG_SQUEEZE',
    });
    expect(entry.squeezeRiskLevelAtEntry).toBe('EXTREME');
    expect(entry.squeezeRiskScoreAtEntry).toBe(10);
    expect(entry.squeezeRiskDirectionAtEntry).toBe('LONG_SQUEEZE');
    expect(entry.squeezeRiskLevelAtExit).toBeNull();
  });

  it('entry cũ thiếu squeeze fields — migrate null, không crash', () => {
    const migrated = migrateAiJournalEntry({
      id: 'aj_legacy',
      timestamp: 1,
      symbol: 'ETHUSDT',
      outcome: { status: 'WIN' },
      scoring: { totalScore: 10, direction: 'LONG', decision: 'VAO', scorerVersion: 'v4' },
    });
    expect(migrated?.squeezeRiskScoreAtEntry).toBeNull();
    expect(migrated?.squeezeRiskLevelAtEntry).toBeNull();
    expect(migrated?.squeezeRiskDirectionAtEntry).toBeNull();
    expect(migrated?.squeezeRiskScoreAtExit).toBeNull();
    expect(migrated?.squeezeRiskLevelAtExit).toBeNull();
    expect(migrated?.squeezeRiskDirectionAtExit).toBeNull();
  });

  it('squeezeAtEntryFromResult — V4 có data, V3 null', () => {
    const squeeze = {
      score: 7,
      level: 'HIGH' as const,
      direction: 'SHORT_SQUEEZE' as const,
      components: {
        fundingCrowding: 1.5,
        oiExpansion: 2,
        lsCrowding: 1.5,
        priceOiDivergence: 1,
        whaleWallConfirmation: 2,
      },
      reasons: ['test'],
      timestamp: Date.now(),
    };
    const v4 = squeezeAtEntryFromResult(squeeze, 'v4');
    expect(v4.squeezeRiskLevelAtEntry).toBe('HIGH');
    const v3 = squeezeAtEntryFromResult(squeeze, 'v3');
    expect(v3.squeezeRiskLevelAtEntry).toBeNull();
  });

  it('buildSnapshotsFromSignalRow ghi squeezeAtEntry từ row.squeezeRisk', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        score: 11,
        decisionLabel: 'VAO_TU_TIN',
        decisionDisplay: 'Vào',
        layers: [],
        mandatoryViolations: [],
        price: 100,
        change24h: 1,
        squeezeRisk: {
          score: 9,
          level: 'EXTREME',
          direction: 'LONG_SQUEEZE',
          components: {
            fundingCrowding: 2,
            oiExpansion: 2,
            lsCrowding: 2,
            priceOiDivergence: 1,
            whaleWallConfirmation: 2,
          },
          reasons: ['test'],
          timestamp: Date.now(),
        },
        v4: {
          score: 11,
          longScore: 11,
          shortScore: 5,
          direction: 'LONG',
          decisionLabel: 'VAO_TU_TIN',
          decisionDisplay: 'Vào',
          winrate: '70%',
          canEnter: true,
          layers: [],
          mandatoryViolations: [],
          hardBlocked: false,
        },
      } as import('../services/signalBoardScan').SignalRow,
      entryPrice: 100,
      sizeActual: 6,
      planSource: 'v4',
      scorerVersion: 'v4',
    });
    expect(snapshots.squeezeAtEntry.squeezeRiskLevelAtEntry).toBe('EXTREME');
    expect(snapshots.squeezeAtEntry.squeezeRiskScoreAtEntry).toBe(9);
  });

  it('resolveSqueezeExitPatchForClose — V4 đóng lệnh lấy từ squeezeRisk store', () => {
    const entry = sampleEntry({ scoring: { scorerVersion: 'v4' } });
    const patch = resolveSqueezeExitPatchForClose({
      entry,
      options: {},
      squeezeRisk: {
        score: 8,
        level: 'HIGH',
        direction: 'SHORT_SQUEEZE',
        components: {
          fundingCrowding: 2,
          oiExpansion: 1,
          lsCrowding: 2,
          priceOiDivergence: 1,
          whaleWallConfirmation: 2,
        },
        reasons: [],
        timestamp: Date.now(),
      },
      scorerVersion: 'v4',
      selectedSymbol: entry.symbol,
    });
    expect(patch.squeezeRiskLevelAtExit).toBe('HIGH');
    expect(patch.squeezeRiskScoreAtExit).toBe(8);
  });

  it('buildAdxJournalSnapshot ghi adxSnapshot khi row có adxGate và adxData', () => {
    const snapshot = buildAdxJournalSnapshot({
      symbol: 'BTCUSDT',
      price: 100,
      change24h: 1,
      trend: 'UP',
      regimeConfidence: 0.8,
      score: 11,
      longScore: 11,
      shortScore: 5,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: 'Vào',
      winrate: '~60%',
      canEnter: true,
      tradePlan: null,
      layers: [],
      mandatoryViolations: [],
      hardBlocked: false,
      fromCache: false,
      adxData: {
        adx1H: 12,
        adx4H: 22,
        adxAvg: 17,
        regime: 'RANGING',
        regimeStrength: 'WEAK',
        isChoppy1H: true,
        isChoppy4H: false,
        bothChoppy: false,
      },
      adxGate: {
        allowed: true,
        block: false,
        regime: 'RANGING',
        tpMultiplier: 0.85,
        slMultiplier: 1.1,
        message: '⚠️ Thị trường RANGING — TP thu hẹp',
        severity: 'WARNING',
      },
    });

    expect(snapshot).toEqual({
      adx1H: 12,
      adx4H: 22,
      adxAvg: 17,
      regime: 'RANGING',
      regimeStrength: undefined,
      bothChoppy: false,
      gateResult: 'WARNING',
      tpMultiplier: 0.85,
      slMultiplier: 1.1,
    });
  });

  it('buildSnapshotsFromSignalRow trả adxSnapshot khi đủ adxGate + adxData', () => {
    const snapshots = buildSnapshotsFromSignalRow({
      row: {
        symbol: 'ETHUSDT',
        price: 3000,
        change24h: 2,
        trend: 'UP',
        regimeConfidence: 0.7,
        score: 10,
        longScore: 10,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'Có thể vào',
        winrate: '~55%',
        canEnter: true,
        tradePlan: null,
        layers: [],
        mandatoryViolations: [],
        hardBlocked: false,
        fromCache: false,
        adxData: {
          adx1H: 40,
          adx4H: 38,
          adxAvg: 39,
          regime: 'TRENDING',
          regimeStrength: 'STRONG',
          isChoppy1H: false,
          isChoppy4H: false,
          bothChoppy: false,
        },
        adxGate: {
          allowed: true,
          block: false,
          regime: 'TRENDING',
          tpMultiplier: 1.2,
          slMultiplier: 0.9,
          message: '✅ Xu hướng mạnh — mở rộng TP',
          severity: 'BONUS',
        },
      },
      entryPrice: 3000,
      sizeActual: 50,
    });

    expect(snapshots.adxSnapshot?.gateResult).toBe('BONUS');
    expect(snapshots.adxSnapshot?.adxAvg).toBe(39);
  });

  it('newAiJournalEntry lưu adxSnapshot optional', () => {
    const entry = newAiJournalEntry({
      symbol: 'BTCUSDT',
      accountSizeAtEntry: 1000,
      market: buildMarketSnapshot({ entryPrice: 100, priceAtAnalysis: 100 }),
      scoring: buildScoringSnapshot({
        totalScore: 11,
        direction: 'LONG',
        layers: [],
        mandatoryViolations: [],
        decision: 'VAO_TU_TIN',
      }),
      plan: {
        entryZoneOptimal: 100,
        entryZoneType: 'PULLBACK',
        stopLoss: 95,
        takeProfit1: 110,
        takeProfit2: 120,
        takeProfit3: 130,
        sizeActual: 50,
        sizeProposed: 50,
        riskRewardRatio: 2,
        openReason: null,
      },
      adxSnapshot: {
        adx1H: 10,
        adx4H: 10,
        adxAvg: 10,
        regime: 'CHOPPY',
        bothChoppy: true,
        gateResult: 'BLOCK',
        tpMultiplier: 1,
        slMultiplier: 1,
      },
    });

    expect(entry.adxSnapshot?.gateResult).toBe('BLOCK');
  });
});
