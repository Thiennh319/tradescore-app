import { NEUTRAL_PROTECTION } from './protectionLayer';
import type { SignalRowV41 } from './scanV41';
import { generateTradeSetupV41 } from './tradeSetupGenerator';
import type { MomentumSignal } from './momentumEngine1H';
import type { MarketIntelligenceDetail } from './types';
/** Giá ticker — khớp SymbolQuote trong SignalBoardV41. */
export interface V41SymbolQuote {
  price: number | null;
  changePct: number | null;
}

/** Một dòng export — toàn bộ field hiển thị trên Signal Board V4.1. */
export interface V41ExportRow {
  timestamp: string;
  symbol: string;
  price: number;
  priceChange24h: number;

  visibilityMode: string;
  marketState: string;
  trendStrength: number;
  trendDirection: string;
  trendExhaustion: number;
  volumeDivergencePts: number;
  reversalProbability: number;
  rsiDivergenceScore: number;
  cvdDivergenceScore: number;
  marketConfidence: number;
  btcAlignmentFactor: number;
  btcDirection: string;

  earlyWarningSeverity: string;
  earlyWarningMessage: string;
  earlyWarningBlockMessage: string;
  earlyWarningSignalCount: number;

  reversalPhase: string;
  reversalCounterDirection: string;

  entryQuality: number;
  entryQualityLong: number;
  entryQualityShort: number;
  opportunityDirection: string;
  opportunityValid: boolean;
  qualityLabel: string;
  eqThreshold: number;
  effectiveConfThreshold: number;
  confidenceTier: string;
  buyScore: number;
  sellScore: number;

  momentumLong: number;
  momentumShort: number;
  momentumConfirmedLong: boolean;
  momentumConfirmedShort: boolean;
  momentumSignalsLong: string;
  momentumSignalsShort: string;
  momentumTpMult: number;
  momentumSlMult: number;

  exhaustionDetected: boolean;
  exhaustionType: string;
  exhaustionStrength: number;
  exhaustionDirection: string;

  stopHuntDetected: boolean;
  stopHuntRisk: string;
  volatilityRisk: string;
  volatilityAtrPct: number;
  protectionPenalty: number;
  protectionWarnings: string;

  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  riskApproved: boolean;
  entryReadyLong: boolean;
  entryReadyShort: boolean;

  marketDetail?: MarketIntelligenceDetail;

  error: string;
}

const CSV_COLUMNS: (keyof V41ExportRow)[] = [
  'timestamp',
  'symbol',
  'price',
  'priceChange24h',
  'visibilityMode',
  'marketState',
  'trendStrength',
  'trendDirection',
  'trendExhaustion',
  'volumeDivergencePts',
  'reversalProbability',
  'rsiDivergenceScore',
  'cvdDivergenceScore',
  'marketConfidence',
  'btcAlignmentFactor',
  'btcDirection',
  'earlyWarningSeverity',
  'earlyWarningMessage',
  'earlyWarningBlockMessage',
  'earlyWarningSignalCount',
  'reversalPhase',
  'reversalCounterDirection',
  'entryQuality',
  'entryQualityLong',
  'entryQualityShort',
  'opportunityDirection',
  'opportunityValid',
  'qualityLabel',
  'eqThreshold',
  'effectiveConfThreshold',
  'confidenceTier',
  'buyScore',
  'sellScore',
  'momentumLong',
  'momentumShort',
  'momentumConfirmedLong',
  'momentumConfirmedShort',
  'momentumSignalsLong',
  'momentumSignalsShort',
  'momentumTpMult',
  'momentumSlMult',
  'exhaustionDetected',
  'exhaustionType',
  'exhaustionStrength',
  'exhaustionDirection',
  'stopHuntDetected',
  'stopHuntRisk',
  'volatilityRisk',
  'volatilityAtrPct',
  'protectionPenalty',
  'protectionWarnings',
  'entry',
  'sl',
  'tp1',
  'tp2',
  'tp3',
  'rr',
  'riskApproved',
  'entryReadyLong',
  'entryReadyShort',
  'error',
];

const DEFAULT_MARGIN_USDT = 6;
const DEFAULT_LEVERAGE = 5;

/** Rules per side — mirrors momentumEngine1H detectors (read-only for export). */
const MOMENTUM_LONG_RULES: ReadonlyArray<{ label: string; signal: MomentumSignal }> = [
  { label: 'Buy Volume Spike', signal: 'BUY_VOLUME_SPIKE_1H' },
  { label: 'CVD Rising', signal: 'CVD_RISING_1H' },
];

const MOMENTUM_SHORT_RULES: ReadonlyArray<{ label: string; signal: MomentumSignal }> = [
  { label: 'Sell Volume Spike', signal: 'SELL_VOLUME_SPIKE_1H' },
  { label: 'CVD Falling', signal: 'CVD_FALLING_1H' },
];

const MOMENTUM_SIGNAL_EXPLAIN: Record<MomentumSignal, string> = {
  BUY_VOLUME_SPIKE_1H:
    'Buy Volume Spike not seen — last 1H candle volume must exceed 1.5× MA20 with bullish close',
  CVD_RISING_1H:
    'CVD Rising not confirmed — last 3 hourly candles need positive taker-buy delta each',
  SELL_VOLUME_SPIKE_1H:
    'Sell Volume Spike not seen — last 1H candle volume must exceed 1.5× MA20 with bearish close',
  CVD_FALLING_1H:
    'CVD Falling not confirmed — last 3 hourly candles need negative taker-buy delta each',
};

/** Confirmed when score >= 2 — same threshold as computeMomentum1H. */
const MOMENTUM_RULES_PER_SIDE = 2;
const MOMENTUM_CONFIRM_REQUIRED = 2;

function parseMomentumSignals(signals: string): Set<MomentumSignal> {
  if (!signals) return new Set();
  return new Set(
    signals.split('|').filter(Boolean) as MomentumSignal[],
  );
}

function formatMomentumRuleLine(label: string, pass: boolean): string {
  const pad = Math.max(1, 22 - label.length);
  return `* ${label}${'.'.repeat(pad)} ${pass ? 'PASS' : 'FAIL'}`;
}

function formatMomentumSideDetail(
  sideLabel: 'LONG' | 'SHORT',
  rules: ReadonlyArray<{ label: string; signal: MomentumSignal }>,
  activeSignals: Set<MomentumSignal>,
  score: number,
  confirmed: boolean,
): string[] {
  const ruleLines = rules.map((rule) =>
    formatMomentumRuleLine(rule.label, activeSignals.has(rule.signal)),
  );
  return [
    `${sideLabel}:`,
    ...ruleLines,
    '',
    `Momentum Score (${sideLabel}): ${score}/${MOMENTUM_RULES_PER_SIDE}`,
    `Required: ${MOMENTUM_CONFIRM_REQUIRED}/${MOMENTUM_RULES_PER_SIDE}`,
    `Confirmed ${sideLabel}: ${confirmed ? 'YES' : 'NO'}`,
  ];
}

/** MOMENTUM DETAIL block — derived from exported signal flags only. */
function formatMomentumDetailSection(row: V41ExportRow): string {
  const longSignals = parseMomentumSignals(row.momentumSignalsLong);
  const shortSignals = parseMomentumSignals(row.momentumSignalsShort);

  return [
    'MOMENTUM DETAIL',
    '',
    ...formatMomentumSideDetail(
      'LONG',
      MOMENTUM_LONG_RULES,
      longSignals,
      row.momentumLong,
      row.momentumConfirmedLong,
    ),
    '',
    ...formatMomentumSideDetail(
      'SHORT',
      MOMENTUM_SHORT_RULES,
      shortSignals,
      row.momentumShort,
      row.momentumConfirmedShort,
    ),
  ].join('\n');
}

const SHORT_ENTRY_EQ_THRESHOLD = 70;

function formatGateLine(label: string, pass: boolean): string {
  const pad = Math.max(1, 24 - label.length);
  return `${label}${'.'.repeat(pad)} ${pass ? 'PASS' : 'FAIL'}`;
}

function formatTradeReadyLine(ready: boolean): string {
  const label = 'Trade Ready';
  const pad = Math.max(1, 24 - label.length);
  return `${label}${'.'.repeat(pad)} ${ready ? 'YES' : 'NO'}`;
}

function resolveActiveEntryQuality(row: V41ExportRow): number {
  if (row.opportunityDirection === 'LONG') return row.entryQualityLong;
  if (row.opportunityDirection === 'SHORT') return row.entryQualityShort;
  return row.entryQuality;
}

function resolveActiveEqThreshold(row: V41ExportRow): number {
  if (row.opportunityDirection === 'SHORT') return SHORT_ENTRY_EQ_THRESHOLD;
  return row.eqThreshold;
}

function resolveActiveMomentumConfirmed(row: V41ExportRow): boolean {
  if (row.opportunityDirection === 'LONG') return row.momentumConfirmedLong;
  if (row.opportunityDirection === 'SHORT') return row.momentumConfirmedShort;
  return false;
}

function resolveTradeReady(row: V41ExportRow): boolean {
  if (row.opportunityDirection === 'LONG') return row.entryReadyLong;
  if (row.opportunityDirection === 'SHORT') return row.entryReadyShort;
  return false;
}

function collectMomentumMissingReasons(row: V41ExportRow): string[] {
  const direction = row.opportunityDirection;
  if (direction !== 'LONG' && direction !== 'SHORT') return [];

  const rules = direction === 'LONG' ? MOMENTUM_LONG_RULES : MOMENTUM_SHORT_RULES;
  const signals = parseMomentumSignals(
    direction === 'LONG' ? row.momentumSignalsLong : row.momentumSignalsShort,
  );

  return rules
    .filter((rule) => !signals.has(rule.signal))
    .map((rule) => `${rule.label} missing`);
}

/** ENTRY GATE STATUS — mirrors resolveEntryReady / opportunity gates (export only). */
function evaluateEntryGates(row: V41ExportRow): {
  marketIntelligence: boolean;
  entryQuality: boolean;
  momentum: boolean;
  protection: boolean;
  earlyWarning: boolean;
  tradeReady: boolean;
  blockReasons: string[];
} {
  const blockReasons: string[] = [];
  const direction = row.opportunityDirection;
  const hasDirection = direction === 'LONG' || direction === 'SHORT';

  const earlyWarningPass = row.earlyWarningSeverity !== 'BLOCK';
  if (!earlyWarningPass) {
    blockReasons.push(row.earlyWarningBlockMessage || 'Early Warning BLOCK');
  }

  const marketIntelligencePass =
    hasDirection && row.marketConfidence >= row.effectiveConfThreshold;
  if (hasDirection && !marketIntelligencePass) {
    blockReasons.push(
      `Market confidence ${Math.round(row.marketConfidence)} < ${Math.round(row.effectiveConfThreshold)}`,
    );
  }
  if (!hasDirection) {
    blockReasons.push('No opportunity direction');
  }

  if (
    row.exhaustionDetected &&
    row.exhaustionDirection !== 'NONE' &&
    hasDirection &&
    direction !== row.exhaustionDirection
  ) {
    blockReasons.push(
      `Exhaustion direction ${row.exhaustionDirection} conflicts with ${direction}`,
    );
  }

  const eqThreshold = resolveActiveEqThreshold(row);
  const activeEq = resolveActiveEntryQuality(row);
  const entryQualityPass = hasDirection && activeEq >= eqThreshold;
  if (hasDirection && !entryQualityPass) {
    blockReasons.push(`Entry quality ${Math.round(activeEq)} < ${Math.round(eqThreshold)}`);
  }

  const momentumPass = hasDirection && resolveActiveMomentumConfirmed(row);
  if (hasDirection && !momentumPass) {
    blockReasons.push('Momentum not confirmed');
    blockReasons.push(...collectMomentumMissingReasons(row));
  }

  const protectionPass = row.volatilityRisk !== 'EXTREME';
  if (!protectionPass) {
    blockReasons.push('Volatility EXTREME');
  }
  if (row.stopHuntDetected && row.stopHuntRisk === 'HIGH') {
    blockReasons.push('Stop hunt detected (HIGH risk)');
  }

  if (row.visibilityMode !== 'TRADE_MODE') {
    blockReasons.push(`Not in Trade Mode (${row.visibilityMode})`);
  }

  if (hasDirection && !row.opportunityValid) {
    blockReasons.push('Opportunity not valid');
  }

  const tradeReady = resolveTradeReady(row);

  return {
    marketIntelligence: hasDirection && marketIntelligencePass,
    entryQuality: entryQualityPass,
    momentum: momentumPass,
    protection: protectionPass,
    earlyWarning: earlyWarningPass,
    tradeReady,
    blockReasons: [...new Set(blockReasons)],
  };
}

function formatEntryGateStatusSection(row: V41ExportRow): string {
  const gates = evaluateEntryGates(row);
  const lines: string[] = [
    'ENTRY GATE STATUS',
    '',
    formatGateLine('Market Intelligence', gates.marketIntelligence),
    formatGateLine('Entry Quality', gates.entryQuality),
    formatGateLine('Momentum Confirmation', gates.momentum),
    formatGateLine('Protection', gates.protection),
    formatGateLine('Early Warning', gates.earlyWarning),
    '',
    formatTradeReadyLine(gates.tradeReady),
  ];

  if (gates.blockReasons.length > 0) {
    lines.push('', 'BLOCK REASONS', '');
    for (const reason of gates.blockReasons) {
      lines.push(`* ${reason}`);
    }
  }

  return lines.join('\n');
}

type RuleExplanationItem = { pass: boolean; text: string };

function ruleLine(item: RuleExplanationItem): string {
  return `${item.pass ? '✓' : '✗'} ${item.text}`;
}

function explainTrendRule(row: V41ExportRow, gates: ReturnType<typeof evaluateEntryGates>): RuleExplanationItem {
  const direction = row.opportunityDirection;
  if (direction === 'NONE') {
    return {
      pass: false,
      text: 'Trend not actionable — neither LONG nor SHORT dominates entry quality scores',
    };
  }
  if (gates.marketIntelligence) {
    return {
      pass: true,
      text:
        `Trend is strong — strength ${Math.round(row.trendStrength)}/100 (${row.trendDirection}), ` +
        `market confidence ${Math.round(row.marketConfidence)}/100 ≥ ${Math.round(row.effectiveConfThreshold)} required`,
    };
  }
  return {
    pass: false,
    text:
      `Market confidence insufficient — ${Math.round(row.marketConfidence)}/100 below ` +
      `${Math.round(row.effectiveConfThreshold)}/100 required for ${direction} (state: ${row.marketState})`,
  };
}

function explainEntryQualityRule(
  row: V41ExportRow,
  gates: ReturnType<typeof evaluateEntryGates>,
): RuleExplanationItem {
  const direction = row.opportunityDirection;
  const eq = Math.round(resolveActiveEntryQuality(row));
  const threshold = Math.round(resolveActiveEqThreshold(row));
  if (direction === 'NONE') {
    return {
      pass: false,
      text: 'Entry quality not applicable — engine has no active trade direction',
    };
  }
  if (gates.entryQuality) {
    const label =
      eq >= threshold + 10 ? 'excellent' : eq >= threshold + 5 ? 'good' : 'acceptable';
    return {
      pass: true,
      text: `Entry quality is ${label} — ${eq}/100 ≥ ${threshold} required for ${direction} (${row.qualityLabel || '—'})`,
    };
  }
  return {
    pass: false,
    text: `Entry quality too low — ${eq}/100 below ${threshold} required for ${direction}`,
  };
}

function explainRiskRule(row: V41ExportRow): RuleExplanationItem {
  if (row.entry <= 0) {
    return {
      pass: false,
      text: 'Risk not evaluated — trade plan missing (price or direction unavailable)',
    };
  }
  if (row.riskApproved) {
    return {
      pass: true,
      text: `Risk acceptable — smart SL plan approved at R:R ${row.rr.toFixed(2)}×`,
    };
  }
  return {
    pass: false,
    text: 'Risk not approved — entry quality below risk engine minimum or max loss exceeds margin tier',
  };
}

function explainMomentumRules(
  row: V41ExportRow,
  gates: ReturnType<typeof evaluateEntryGates>,
): RuleExplanationItem[] {
  const direction = row.opportunityDirection;
  if (direction !== 'LONG' && direction !== 'SHORT') {
    return [{ pass: false, text: 'Momentum not evaluated — no active direction' }];
  }

  const score = direction === 'LONG' ? row.momentumLong : row.momentumShort;
  const rules = direction === 'LONG' ? MOMENTUM_LONG_RULES : MOMENTUM_SHORT_RULES;
  const signals = parseMomentumSignals(
    direction === 'LONG' ? row.momentumSignalsLong : row.momentumSignalsShort,
  );

  if (gates.momentum) {
    const present = rules
      .filter((rule) => signals.has(rule.signal))
      .map((rule) => rule.label)
      .join(' + ');
    return [
      {
        pass: true,
        text: `Momentum confirmed for ${direction} — ${score}/2 signals (${present})`,
      },
    ];
  }

  const items: RuleExplanationItem[] = [
    {
      pass: false,
      text: `Momentum confirmation missing — only ${score}/2 required 1H signals for ${direction}`,
    },
  ];
  for (const rule of rules) {
    if (!signals.has(rule.signal)) {
      items.push({
        pass: false,
        text: MOMENTUM_SIGNAL_EXPLAIN[rule.signal],
      });
    }
  }
  return items;
}

function explainProtectionRule(
  row: V41ExportRow,
  gates: ReturnType<typeof evaluateEntryGates>,
): RuleExplanationItem {
  if (gates.protection) {
    const huntNote = row.stopHuntDetected
      ? `, stop-hunt watch (${row.stopHuntRisk})`
      : '';
    return {
      pass: true,
      text: `Protection clear — volatility ${row.volatilityRisk || 'NORMAL'}${huntNote}`,
    };
  }
  return {
    pass: false,
    text: `Protection blocks entry — volatility ${row.volatilityRisk} exceeds safe threshold (penalty ${Math.round(row.protectionPenalty)})`,
  };
}

function explainEarlyWarningRule(
  row: V41ExportRow,
  gates: ReturnType<typeof evaluateEntryGates>,
): RuleExplanationItem {
  if (gates.earlyWarning) {
    if (row.earlyWarningSeverity !== 'CLEAR' && row.earlyWarningMessage) {
      return {
        pass: true,
        text: `Early warning present but not blocking — ${row.earlyWarningMessage}`,
      };
    }
    return { pass: true, text: 'Early warning clear — no reversal block active' };
  }
  const reason = row.earlyWarningBlockMessage || row.earlyWarningMessage || 'reversal signals confirmed';
  return {
    pass: false,
    text: `Early warning blocks entry — ${reason}`,
  };
}

function explainVisibilityRule(row: V41ExportRow): RuleExplanationItem {
  if (row.visibilityMode === 'TRADE_MODE') {
    return { pass: true, text: 'Visibility allows trading — TRADE_MODE active' };
  }
  if (row.visibilityMode === 'POSITION_MODE') {
    return { pass: true, text: 'Position mode — managing open trade, new entry gated separately' };
  }
  return {
    pass: false,
    text: `Not in trade mode — visibility is ${row.visibilityMode}, engine hides entry actions`,
  };
}

function explainOpportunityRule(row: V41ExportRow): RuleExplanationItem {
  if (row.opportunityValid) {
    return {
      pass: true,
      text: `Opportunity valid for ${row.opportunityDirection} — passes entry quality engine gates`,
    };
  }
  const direction = row.opportunityDirection;
  if (direction === 'NONE') {
    return {
      pass: false,
      text: 'Opportunity invalid — buy/sell scores too weak to pick a direction',
    };
  }
  return {
    pass: false,
    text: `Opportunity invalid for ${direction} — fails momentum, confidence, or early-warning composite check`,
  };
}

function resolveFinalDecisionLabel(
  row: V41ExportRow,
  gates: ReturnType<typeof evaluateEntryGates>,
): string {
  if (row.error) return 'ERROR';
  if (row.earlyWarningSeverity === 'BLOCK') return 'BLOCK';
  if (row.visibilityMode === 'INACTIVE') return 'INACTIVE';
  if (row.visibilityMode === 'WATCH_MODE') return 'WATCH';
  if (gates.tradeReady && row.riskApproved) return 'ENTER';
  return 'WAIT';
}

/** RULE EXPLANATION — human-readable decision trace (export debug only). */
function formatRuleExplanationSection(row: V41ExportRow): string {
  const gates = evaluateEntryGates(row);
  const finalDecision = resolveFinalDecisionLabel(row, gates);
  const entering = finalDecision === 'ENTER';

  const items: RuleExplanationItem[] = [
    explainTrendRule(row, gates),
    explainEntryQualityRule(row, gates),
    explainRiskRule(row),
    ...explainMomentumRules(row, gates),
    explainProtectionRule(row, gates),
    explainEarlyWarningRule(row, gates),
    explainVisibilityRule(row),
    explainOpportunityRule(row),
  ];

  const header = entering ? 'WHY ENTER' : 'WHY NOT ENTER';

  return [
    'RULE EXPLANATION',
    '',
    header,
    '',
    ...items.map(ruleLine),
    '',
    'Final Decision:',
    finalDecision,
  ].join('\n');
}

function formatMarketScoreLine(label: string, score: number): string {
  const pad = Math.max(1, 24 - label.length);
  const prefix = score >= 0 ? '+' : '';
  return `${label}${'.'.repeat(pad)} ${prefix}${Math.round(score)}`;
}

function formatMarketConfirmLine(label: string, pass: boolean): string {
  const pad = Math.max(1, 24 - label.length);
  return `${label}${'.'.repeat(pad)} ${pass ? 'PASS' : 'FAIL'}`;
}

function formatMarketDetailSection(row: V41ExportRow): string {
  const detail = row.marketDetail;
  if (!detail) {
    return ['MARKET DETAIL', '', '  (detail unavailable — re-scan required)'].join('\n');
  }

  const { trend, exhaustion, confidence, reversal } = detail;
  const btcAligned = confidence.btcAlignmentFactor >= 0.75;

  return [
    'MARKET DETAIL',
    '',
    'Trend Score',
    '',
    formatMarketScoreLine('EMA Alignment', trend.emaAlignmentScore),
    formatMarketScoreLine('EMA Slope', trend.slopeScore),
    formatMarketScoreLine('ADX', trend.adxScore),
    '',
    `Final Trend Score: ${Math.round(trend.trendStrength)} (${trend.trendDirection})`,
    '',
    'Exhaustion Score',
    '',
    formatMarketScoreLine('RSI Extreme', exhaustion.rsiExtremeScore),
    formatMarketScoreLine('Distance From EMA20', exhaustion.distanceEMA20Score),
    formatMarketScoreLine('Volume Divergence', exhaustion.volumeDivergencePts),
    formatMarketScoreLine('Candle Streak', exhaustion.candleStreakScore),
    '',
    `Final Exhaustion: ${Math.round(exhaustion.trendExhaustion)}`,
    '',
    'Confidence Detail',
    '',
    formatMarketConfirmLine('Trend Direction', trend.trendDirection !== 'NEUTRAL'),
    formatMarketConfirmLine(
      'Volume Confirmation',
      exhaustion.volumeDivergencePts === 0,
    ),
    formatMarketConfirmLine('BTC Alignment', btcAligned),
    formatMarketConfirmLine('RSI Reversal Divergence', reversal.rsiDivergenceScore === 0),
    formatMarketConfirmLine('CVD Reversal Divergence', reversal.cvdDivergenceScore === 0),
    '',
    `Trend Base: ${Math.round(confidence.trendStrengthBase)} × Exhaustion ${confidence.exhaustionMultiplier.toFixed(2)} × BTC ${confidence.btcAlignmentFactor.toFixed(2)} (${confidence.altDirection}/${confidence.btcDirection})`,
    `Confidence: ${Math.round(confidence.marketConfidence)}`,
    '',
    `Reversal Probability: ${Math.round(reversal.reversalProbability)}`,
  ].join('\n');
}

function vnTimestamp(): string {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function num(value: number | null | undefined, fallback = 0): number {
  return value != null && Number.isFinite(value) ? value : fallback;
}

function formatDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(4);
}

function joinUnique(parts: string[]): string {
  return [...new Set(parts.filter(Boolean))].join('|');
}

function resolvePrice(row: SignalRowV41, quote?: V41SymbolQuote): number {
  if (quote?.price != null && Number.isFinite(quote.price) && quote.price > 0) {
    return quote.price;
  }
  if (row.markPrice != null && Number.isFinite(row.markPrice) && row.markPrice > 0) {
    return row.markPrice;
  }
  return 0;
}

function resolveTradePlanFields(
  row: SignalRowV41,
  markPrice: number,
): Pick<V41ExportRow, 'entry' | 'sl' | 'tp1' | 'tp2' | 'tp3' | 'rr' | 'riskApproved'> {
  const empty = {
    entry: 0,
    sl: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    rr: 0,
    riskApproved: false,
  };

  if (markPrice <= 0 || !row.opportunity) return empty;

  const direction =
    row.opportunity.opportunityDirection === 'LONG' ||
    row.opportunity.opportunityDirection === 'SHORT'
      ? row.opportunity.opportunityDirection
      : null;
  if (!direction) return empty;

  try {
    const setup = generateTradeSetupV41({
      snapshot: row.snapshot,
      opportunity: row.opportunity,
      protection: row.protection ?? NEUTRAL_PROTECTION,
      direction,
      markPrice,
      marginUsdt: DEFAULT_MARGIN_USDT,
      leverage: DEFAULT_LEVERAGE,
    });

    return {
      entry: num(setup.markPrice),
      sl: num(setup.smartSlPrice),
      tp1: num(setup.tp1Price),
      tp2: num(setup.tp2Price),
      tp3: num(setup.tp3Price),
      rr: num(setup.riskRewardRatio),
      riskApproved: setup.riskApproved,
    };
  } catch {
    return empty;
  }
}

function resolveEntryReady(row: SignalRowV41): {
  entryReadyLong: boolean;
  entryReadyShort: boolean;
} {
  const { snapshot, opportunity, momentum, earlyWarning, visibilityMode } = row;
  if (visibilityMode !== 'TRADE_MODE' || !opportunity) {
    return { entryReadyLong: false, entryReadyShort: false };
  }

  const isEwBlock = earlyWarning?.severity === 'BLOCK';
  if (isEwBlock) {
    return { entryReadyLong: false, entryReadyShort: false };
  }

  const eqThresholdLong = opportunity.eqThreshold ?? 70;
  const confThreshold = opportunity.effectiveConfThreshold ?? 60;
  const momentumConfirmedLong =
    momentum?.momentumConfirmedLong ?? opportunity.momentumConfirmedLong ?? false;

  const entryReadyLong =
    opportunity.opportunityDirection === 'LONG' &&
    (opportunity.entryQualityLong ?? 0) >= eqThresholdLong &&
    snapshot.marketConfidence >= confThreshold &&
    momentumConfirmedLong;

  const entryReadyShort =
    opportunity.opportunityDirection === 'SHORT' &&
    (opportunity.entryQualityShort ?? 0) >= 70;

  return { entryReadyLong, entryReadyShort };
}

/** Thu thập một dòng export từ SignalRowV41. */
export function buildExportRowV41(
  row: SignalRowV41,
  quote?: V41SymbolQuote,
): V41ExportRow {
  const { snapshot, opportunity, protection, earlyWarning, reversalState, momentum, exhaustion } =
    row;
  const markPrice = resolvePrice(row, quote);
  const plan = resolveTradePlanFields(row, markPrice);
  const { entryReadyLong, entryReadyShort } = resolveEntryReady(row);

  return {
    timestamp: vnTimestamp(),
    symbol: row.symbol,
    price: markPrice,
    priceChange24h: num(quote?.changePct),

    visibilityMode: row.visibilityMode,
    marketState: snapshot.marketState,
    trendStrength: num(snapshot.trendStrength),
    trendDirection: snapshot.trendDirection,
    trendExhaustion: num(snapshot.trendExhaustion),
    volumeDivergencePts: num(snapshot.volumeDivergencePts),
    reversalProbability: num(snapshot.reversalProbability),
    rsiDivergenceScore: num(snapshot.rsiDivergenceScore),
    cvdDivergenceScore: num(snapshot.cvdDivergenceScore),
    marketConfidence: num(snapshot.marketConfidence),
    btcAlignmentFactor: num(snapshot.btcAlignmentFactor),
    btcDirection: snapshot.btcDirection,

    earlyWarningSeverity: earlyWarning?.severity ?? 'CLEAR',
    earlyWarningMessage: earlyWarning?.warningMessage ?? '',
    earlyWarningBlockMessage: earlyWarning?.blockMessage ?? '',
    earlyWarningSignalCount: num(earlyWarning?.signalCount),

    // Path A off for breakout symbols → phase NONE / counter ''. Never stringify null as "undefined".
    reversalPhase:
      reversalState?.phase != null && reversalState.phase !== ''
        ? reversalState.phase
        : 'NONE',
    reversalCounterDirection:
      reversalState?.counterDirection === 'LONG' ||
      reversalState?.counterDirection === 'SHORT'
        ? reversalState.counterDirection
        : '',

    entryQuality: num(opportunity?.entryQuality),
    entryQualityLong: num(opportunity?.entryQualityLong),
    entryQualityShort: num(opportunity?.entryQualityShort),
    opportunityDirection: opportunity?.opportunityDirection ?? 'NONE',
    opportunityValid: opportunity?.opportunityValid === true,
    qualityLabel: opportunity?.qualityLabel ?? '',
    eqThreshold: num(opportunity?.eqThreshold, 70),
    effectiveConfThreshold: num(opportunity?.effectiveConfThreshold, 60),
    confidenceTier: opportunity?.confidenceTier ?? '',
    buyScore: num(opportunity?.buyScore),
    sellScore: num(opportunity?.sellScore),

    momentumLong: num(momentum?.momentumLong),
    momentumShort: num(momentum?.momentumShort),
    momentumConfirmedLong: momentum?.momentumConfirmedLong === true,
    momentumConfirmedShort: momentum?.momentumConfirmedShort === true,
    momentumSignalsLong: joinUnique(momentum?.signalsLong ?? []),
    momentumSignalsShort: joinUnique(momentum?.signalsShort ?? []),
    momentumTpMult: num(momentum?.tpMultiplier, 1),
    momentumSlMult: num(momentum?.slMultiplier, 1),

    exhaustionDetected: exhaustion?.exhaustionDetected === true,
    exhaustionType: exhaustion?.exhaustionType ?? 'NONE',
    exhaustionStrength: num(exhaustion?.exhaustionStrength),
    exhaustionDirection: exhaustion?.direction ?? 'NONE',

    stopHuntDetected: protection?.stopHuntDetected === true,
    stopHuntRisk: protection?.stopHuntRisk ?? '',
    volatilityRisk: protection?.volatilityRisk ?? '',
    volatilityAtrPct: num(protection?.volatilityAtrPct),
    protectionPenalty: num(protection?.protectionPenalty),
    protectionWarnings: joinUnique(protection?.protectionWarnings ?? []),

    ...plan,
    entryReadyLong,
    entryReadyShort,

    marketDetail: snapshot.detail,

    error: row.error ?? '',
  };
}

function escapeCsvValue(_key: keyof V41ExportRow, value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return formatDecimal(value);
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Format nhiều dòng thành CSV (header + data). */
export function formatAsCSVV41(rows: V41ExportRow[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const cells = CSV_COLUMNS.map((col) => escapeCsvValue(col, row[col]));
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

function txtNum(value: number): string {
  return formatDecimal(value);
}

function formatCoinBlockV41(row: V41ExportRow): string {
  const changeSign = row.priceChange24h >= 0 ? '+' : '';
  const ewLine =
    row.earlyWarningSeverity !== 'CLEAR'
      ? `  Severity: ${row.earlyWarningSeverity}${
          row.earlyWarningMessage ? ` — ${row.earlyWarningMessage}` : ''
        }${row.earlyWarningBlockMessage ? ` | Block: ${row.earlyWarningBlockMessage}` : ''}`
      : '  Không có cảnh báo';

  const reversalLine =
    row.reversalPhase !== 'NONE'
      ? `  Phase: ${row.reversalPhase}${
          row.reversalCounterDirection ? ` · Counter: ${row.reversalCounterDirection}` : ''
        }`
      : '  Không theo dõi đảo chiều';

  const protectionLine =
    row.protectionWarnings.length > 0
      ? row.protectionWarnings.replace(/\|/g, ' | ')
      : 'Không có';

  return [
    '════════════════════════════',
    `${row.symbol} — ${txtNum(row.price)} (${changeSign}${txtNum(row.priceChange24h)}%)`,
    `Thời điểm: ${row.timestamp}`,
    `Visibility: ${row.visibilityMode}`,
    '════════════════════════════',
    '',
    'MARKET INTELLIGENCE:',
    `  State: ${row.marketState}`,
    `  Confidence: ${txtNum(row.marketConfidence)}/100`,
    `  Trend: ${txtNum(row.trendStrength)} (${row.trendDirection})`,
    `  Exhaustion: ${txtNum(row.trendExhaustion)}`,
    `  Reversal prob: ${txtNum(row.reversalProbability)}`,
    `  RSI div: ${txtNum(row.rsiDivergenceScore)} | CVD div: ${txtNum(row.cvdDivergenceScore)}`,
    `  Vol divergence pts: ${txtNum(row.volumeDivergencePts)}`,
    `  BTC: ${row.btcDirection} · alignment ${txtNum(row.btcAlignmentFactor)}`,
    '',
    formatMarketDetailSection(row),
    '',
    'EARLY WARNING:',
    ewLine,
    row.earlyWarningSignalCount > 0
      ? `  Signal count: ${row.earlyWarningSignalCount}`
      : '',
    '',
    'REVERSAL WATCH:',
    reversalLine,
    '',
    'ENTRY QUALITY:',
    `  EQ: ${txtNum(row.entryQuality)}/100 — ${row.qualityLabel || '—'}`,
    `  Long: ${txtNum(row.entryQualityLong)} | Short: ${txtNum(row.entryQualityShort)}`,
    `  Direction: ${row.opportunityDirection} · Valid: ${row.opportunityValid ? 'yes' : 'no'}`,
    `  Ngưỡng EQ: ${txtNum(row.eqThreshold)} · Conf: ${txtNum(row.effectiveConfThreshold)} (${row.confidenceTier || '—'})`,
    `  Buy/Sell score: ${txtNum(row.buyScore)}/${txtNum(row.sellScore)}`,
    `  Entry ready — LONG: ${row.entryReadyLong ? 'yes' : 'no'} | SHORT: ${row.entryReadyShort ? 'yes' : 'no'}`,
    '',
    formatEntryGateStatusSection(row),
    '',
    'MOMENTUM 1H:',
    `  Long: ${row.momentumLong} (confirmed: ${row.momentumConfirmedLong ? 'yes' : 'no'})`,
    row.momentumSignalsLong ? `  Signals L: ${row.momentumSignalsLong.replace(/\|/g, ', ')}` : '',
    `  Short: ${row.momentumShort} (confirmed: ${row.momentumConfirmedShort ? 'yes' : 'no'})`,
    row.momentumSignalsShort ? `  Signals S: ${row.momentumSignalsShort.replace(/\|/g, ', ')}` : '',
    `  TP mult: ×${txtNum(row.momentumTpMult)} | SL mult: ×${txtNum(row.momentumSlMult)}`,
    '',
    formatMomentumDetailSection(row),
    '',
    'EXHAUSTION:',
    `  Detected: ${row.exhaustionDetected ? 'yes' : 'no'}`,
    row.exhaustionDetected
      ? `  Type: ${row.exhaustionType} · Strength: ${txtNum(row.exhaustionStrength)} · Dir: ${row.exhaustionDirection}`
      : '',
    '',
    'PROTECTION:',
    `  Stop hunt: ${row.stopHuntDetected ? 'yes' : 'no'} (${row.stopHuntRisk || '—'})`,
    `  Volatility: ${row.volatilityRisk || '—'} · ATR%: ${txtNum(row.volatilityAtrPct)}`,
    `  Penalty: ${txtNum(row.protectionPenalty)}`,
    `  Warnings: ${protectionLine}`,
    '',
    'KẾ HOẠCH (theo hướng cơ hội):',
    row.entry > 0
      ? [
          `  Entry: ${txtNum(row.entry)}`,
          `  SL:    ${txtNum(row.sl)}`,
          `  TP1:   ${txtNum(row.tp1)} (R:R ${txtNum(row.rr)}×)`,
          `  TP2:   ${txtNum(row.tp2)}`,
          `  TP3:   ${txtNum(row.tp3)}`,
          `  Risk approved: ${row.riskApproved ? 'yes' : 'no'}`,
        ].join('\n')
      : '  Chưa đủ dữ liệu giá/kế hoạch',
    '',
    formatRuleExplanationSection(row),
    '',
    row.error ? `LỖI: ${row.error}` : '',
    '────────────────────────────',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Format nhiều dòng thành TXT dễ đọc. */
export function formatAsTXTV41(rows: V41ExportRow[]): string {
  return rows.map(formatCoinBlockV41).join('\n\n');
}

/** Export toàn bộ coins V4.1 — map rows → buildExportRowV41 → CSV hoặc TXT. */
export function exportSignalDataV41(
  rows: SignalRowV41[],
  quotes: Record<string, V41SymbolQuote>,
  format: 'csv' | 'txt',
): string {
  const exportRows = rows.map((row) => buildExportRowV41(row, quotes[row.symbol]));
  return format === 'csv' ? formatAsCSVV41(exportRows) : formatAsTXTV41(exportRows);
}
