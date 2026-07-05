import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { AI_JOURNAL_STORAGE_KEYS } from '../constants/aiJournal';
import type { AppSettings } from '../constants/scoring';
import { computeDailyLossUsdt, derivePsychology, buildTodayStatsLockExtras } from '../store/useTradeStore';
import { computePositionPnl } from '../utils/positionPnl';
import { evaluatePositionV2 } from './positionAdvisorV3';
import { computePositionMaxLossUSDT, evaluatePositionV4 } from './positionAdvisorV4';
import { getADXAnalysis } from './indicators';
import type { AllMarketData } from './binanceApi';
import { scoringResultV4ToLegacyV3 } from './tradePlanV4';
import { LEGACY_STORAGE_KEYS } from './appPersistence';
import type { ScorerVersion } from '../constants/scoring';
import { fetchAnalysisDataForSymbol } from './symbolAnalysisFetch';
import { sendPositionAlert } from './notificationService';
import {
  shouldNotifyForUrgency,
  type NotificationThrottleEntry,
  type NotificationThrottleState,
} from './notificationThrottle';
import {
  loadPersistedJournal,
  loadPersistedScoringPsychology,
  loadPersistedSettings,
  loadPersistedTimeframe,
} from './tradeStorePersist';
import { storageGetItem, storageSetItem } from './storage';
import { buildTodayStatsFromJournal } from './scorerV3';
import { isV41JournalEntry } from '../hooks/useJournalMarketSync';
import { evaluatePositionV41 } from './v41/positionAdvisorV41';
import { NEUTRAL_PROTECTION } from './v41/protectionLayer';
import { useV41Store } from '../store/useV41Store';

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await storageSetItem(key, JSON.stringify(value));
}

export async function loadNotificationThrottleState(): Promise<NotificationThrottleState> {
  return (await readJson<NotificationThrottleState>(
    AI_JOURNAL_STORAGE_KEYS.NOTIFICATION_THROTTLE,
  )) ?? {};
}

export async function persistNotificationThrottleState(
  state: NotificationThrottleState,
): Promise<void> {
  await writeJson(AI_JOURNAL_STORAGE_KEYS.NOTIFICATION_THROTTLE, state);
}

async function persistTradeLastFundingState(
  tradeId: string,
  fundingState: AiTradeJournalEntry['lastFundingState'],
): Promise<void> {
  if (fundingState == null) return;
  const journal =
    (await readJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL)) ?? [];
  const target = journal.find((e) => e.id === tradeId);
  if (!target || target.lastFundingState === fundingState) return;
  await writeJson(
    AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL,
    journal.map((e) => (e.id === tradeId ? { ...e, lastFundingState: fundingState } : e)),
  );
}

async function persistTradeLastSqueezeRisk(
  tradeId: string,
  level: AiTradeJournalEntry['lastSqueezeRiskLevel'],
  direction: AiTradeJournalEntry['lastSqueezeRiskDirection'],
): Promise<void> {
  if (level == null || direction == null) return;
  const journal =
    (await readJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL)) ?? [];
  const target = journal.find((e) => e.id === tradeId);
  if (
    !target ||
    (target.lastSqueezeRiskLevel === level && target.lastSqueezeRiskDirection === direction)
  ) {
    return;
  }
  await writeJson(
    AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL,
    journal.map((e) =>
      e.id === tradeId ? { ...e, lastSqueezeRiskLevel: level, lastSqueezeRiskDirection: direction } : e,
    ),
  );
}

async function loadOpenAiTrades(): Promise<AiTradeJournalEntry[]> {
  const journal =
    (await readJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL)) ?? [];
  return journal.filter((t) => t.outcome.status === 'OPEN' && !t.archived);
}

function computeTradeAdvisorPnl(
  trade: AiTradeJournalEntry,
  currentPrice: number,
  leverage: number,
) {
  const direction = trade.scoring.direction;
  const entryPrice = trade.market.entryPrice;
  const size = trade.plan.sizeActual;
  const snapshot = computePositionPnl(
    { direction, entryPrice, leverage, size },
    currentPrice,
  );
  return {
    pct: snapshot.pnlPercent ?? 0,
    usdt: snapshot.pnlUsdt ?? 0,
  };
}

function buildV41OpenPositionFromJournal(
  trade: AiTradeJournalEntry,
  leverage: number,
) {
  return {
    entryPrice: trade.market.entryPrice,
    direction: trade.scoring.direction,
    size: trade.plan.sizeActual,
    leverage,
    sl: trade.plan.slActual,
    tp1: trade.plan.tp1Actual,
    tp2: trade.plan.tp2,
    tp3: trade.plan.tp3,
    openedAt: trade.timestamp,
  };
}

export interface PositionAdvisorAlertContext {
  openTrades: AiTradeJournalEntry[];
  settings: AppSettings;
  throttle: NotificationThrottleState;
  timeframe: Awaited<ReturnType<typeof loadPersistedTimeframe>>;
  legacyJournal: Awaited<ReturnType<typeof loadPersistedJournal>>;
  scorerVersion: ScorerVersion;
}

function resolveAdxDataFromMarket(market: AllMarketData) {
  try {
    const klines1h = market.klines['1h']?.klines ?? [];
    const klines4h = market.klines['4h']?.klines ?? [];
    if (klines1h.length === 0 || klines4h.length === 0) return undefined;
    return getADXAnalysis(klines1h, klines4h);
  } catch {
    return undefined;
  }
}

export async function loadPositionAdvisorAlertContext(): Promise<PositionAdvisorAlertContext> {
  const [openTrades, settings, throttle, timeframe, legacyJournal, scorerVersionRaw] =
    await Promise.all([
    loadOpenAiTrades(),
    loadPersistedSettings(),
    loadNotificationThrottleState(),
    loadPersistedTimeframe(),
    loadPersistedJournal(),
    readJson<ScorerVersion>(LEGACY_STORAGE_KEYS.scorerVersion),
  ]);
  const scorerVersion: ScorerVersion = scorerVersionRaw ?? 'v4';
  return { openTrades, settings, throttle, timeframe, legacyJournal, scorerVersion };
}

/**
 * Quét lệnh OPEN, đánh giá V3, gửi push khi urgency tăng (hoặc CRITICAL lặp sau 5 phút).
 * Dùng cho background task và foreground scan 60s.
 */
export async function runPositionAdvisorAlerts(
  ctx?: Partial<PositionAdvisorAlertContext>,
): Promise<{ sent: boolean; throttle: NotificationThrottleState }> {
  const loaded = ctx?.openTrades
    ? (ctx as PositionAdvisorAlertContext)
    : await loadPositionAdvisorAlertContext();
  const {
    openTrades,
    settings,
    throttle: initialThrottle,
    timeframe,
    legacyJournal,
    scorerVersion,
  } = loaded;

  if (openTrades.length === 0) {
    return { sent: false, throttle: initialThrottle };
  }

  const psychology = derivePsychology(legacyJournal, settings);
  const scoringPsychology = await loadPersistedScoringPsychology();
  const todayStats = buildTodayStatsFromJournal(
    psychology.consecutiveLosses,
    computeDailyLossUsdt(legacyJournal),
    buildTodayStatsLockExtras(psychology),
  );
  const recentJournal = openTrades.map((t) => ({ outcome: t.outcome }));

  let throttle = { ...initialThrottle };
  let hasAlertSent = false;
  const leverage = settings.leverage ?? 5;

  for (const trade of openTrades) {
    try {
      const analysis = await fetchAnalysisDataForSymbol(
        trade.symbol as Parameters<typeof fetchAnalysisDataForSymbol>[0],
        timeframe,
        scoringPsychology,
        todayStats,
        recentJournal,
      );
      if (!analysis) continue;

      const direction = trade.scoring.direction;
      const pnl = computeTradeAdvisorPnl(trade, analysis.currentPrice, leverage);

      if (isV41JournalEntry(trade)) {
        const lastSnapshot = useV41Store.getState().getSymbolState(trade.symbol).lastSnapshot;
        const recommendation = lastSnapshot
          ? evaluatePositionV41({
              snapshot: lastSnapshot,
              protection: NEUTRAL_PROTECTION,
              openPosition: buildV41OpenPositionFromJournal(trade, leverage),
              markPrice: analysis.currentPrice,
            })
          : {
              label: 'V4.1 — đang theo dõi',
              urgency: 'LOW' as const,
              reason: 'no v41 snapshot',
            };

        const entry = throttle[trade.id];
        if (!shouldNotifyForUrgency(entry, recommendation.urgency)) continue;

        const sent = await sendPositionAlert({
          symbol: trade.symbol,
          direction,
          recommendationLabel: recommendation.label,
          urgency: recommendation.urgency,
          reasons: recommendation.reason ? [recommendation.reason] : [],
          currentPnlUSDT: pnl.usdt,
        });

        if (sent) {
          throttle = {
            ...throttle,
            [trade.id]: {
              lastNotifiedUrgency: recommendation.urgency,
              lastNotifiedAt: Date.now(),
            },
          };
          hasAlertSent = true;
        }
        continue;
      }

      const scoringForAdvisor =
        scorerVersion === 'v4'
          ? scoringResultV4ToLegacyV3(analysis.scoringResultV4)
          : analysis.scoringResultV3;
      const ownScore =
        direction === 'LONG' ? scoringForAdvisor.long : scoringForAdvisor.short;
      const oppositeScore =
        direction === 'LONG' ? scoringForAdvisor.short : scoringForAdvisor.long;

      const positionPayload = {
        direction,
        entryPrice: trade.market.entryPrice,
        sl: trade.plan.slActual,
        tp1: trade.plan.tp1Actual,
        tp2: trade.plan.tp2,
        tp3: trade.plan.tp3,
        openedAt: trade.timestamp,
        openTime: trade.timestamp,
        currentPnlPct: pnl.pct,
        currentPnlUSDT: pnl.usdt,
        lastFundingState: trade.lastFundingState,
        lastSqueezeRiskLevel: trade.lastSqueezeRiskLevel,
        lastSqueezeRiskDirection: trade.lastSqueezeRiskDirection,
        maxLossUSDT: computePositionMaxLossUSDT(
          trade.market.entryPrice,
          trade.plan.slActual,
          trade.plan.sizeActual,
          leverage,
        ),
      };
      const advisorInput = {
        position: positionPayload,
        currentPrice: analysis.currentPrice,
        ownDirectionScore: {
          totalScore: ownScore.totalScore,
          direction,
          groupScores: ownScore.groupScores,
          decision: ownScore.decision,
          hardBlocks: ownScore.hardBlocks,
          groupBlocks: ownScore.groupBlocks,
          warnings: ownScore.warnings,
          layers: ownScore.layers.map((l) => ({
            layerNumber: l.layerNumber,
            score: l.score,
            reason: l.reason,
          })),
        },
        oppositeDirectionScore: {
          totalScore: oppositeScore.totalScore,
          decision: oppositeScore.decision,
          hardBlocks: oppositeScore.hardBlocks,
        },
        marketMode: scoringForAdvisor.marketMode,
      };
      const recommendation =
        scorerVersion === 'v4'
          ? evaluatePositionV4({
              ...advisorInput,
              atr1h: analysis.scoringResultV4.atr1h,
              currentFundingState: analysis.scoringResultV4.l6Detail?.fundingState,
              currentSqueezeRisk: analysis.scoringResultV4.squeezeRisk,
              adxData: resolveAdxDataFromMarket(analysis.market),
            })
          : evaluatePositionV2({
              ...advisorInput,
              atr1h: analysis.scoringResultV3.atr1h,
            });

      if (scorerVersion === 'v4' && analysis.scoringResultV4.l6Detail?.fundingState) {
        await persistTradeLastFundingState(
          trade.id,
          analysis.scoringResultV4.l6Detail.fundingState,
        );
      }

      if (scorerVersion === 'v4' && analysis.scoringResultV4.squeezeRisk) {
        const { level, direction } = analysis.scoringResultV4.squeezeRisk;
        await persistTradeLastSqueezeRisk(trade.id, level, direction);
      }

      const entry = throttle[trade.id];
      if (!shouldNotifyForUrgency(entry, recommendation.urgency)) continue;

      const sent = await sendPositionAlert({
        symbol: trade.symbol,
        direction,
        recommendationLabel: recommendation.label,
        urgency: recommendation.urgency,
        reasons: recommendation.reasons,
        currentPnlUSDT: pnl.usdt,
      });

      if (sent) {
        throttle = {
          ...throttle,
          [trade.id]: {
            lastNotifiedUrgency: recommendation.urgency,
            lastNotifiedAt: Date.now(),
          },
        };
        hasAlertSent = true;
      }
    } catch (innerErr) {
      console.error(`[positionAdvisorAlert] lỗi ${trade.symbol}:`, innerErr);
    }
  }

  if (hasAlertSent) {
    await persistNotificationThrottleState(throttle);
  }

  return { sent: hasAlertSent, throttle };
}

export function mergeThrottleUpdate(
  state: NotificationThrottleState,
  tradeId: string,
  urgency: NotificationThrottleEntry['lastNotifiedUrgency'],
): NotificationThrottleState {
  return {
    ...state,
    [tradeId]: { lastNotifiedUrgency: urgency, lastNotifiedAt: Date.now() },
  };
}
