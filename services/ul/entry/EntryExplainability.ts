/**
 * Task 15.7.1 — Entry Quality explainability layer.
 * Builds structured evidence from already-evaluated checks + inputs.
 * Does NOT re-score, re-weight, or re-decide.
 */

import { ENTRY_QUALITY_RULES, isFiniteNum } from './EntryQualityRules';
import type {
  EntryQualityCheck,
  EntryQualityCheckId,
  EntryQualityEntryDecisionInput,
  EntryQualityMarketSnapshot,
  EntryQualityRuleBookView,
  EntryQualitySide,
} from './EntryQualityTypes';
import type {
  EntryQualityEvidence,
  EntryQualityEvidenceSource,
} from './EntryExplainabilityTypes';
import { ENTRY_QUALITY_EVIDENCE_MISSING } from './EntryExplainabilityTypes';

const SOURCE_BY_CHECK: Record<EntryQualityCheckId, EntryQualityEvidenceSource> = {
  ema_alignment: 'EMA',
  ema_slope: 'EMA',
  trend_direction: 'Trend',
  momentum: 'Momentum',
  rsi_zone: 'RSI',
  macd: 'MACD',
  volume_confirmation: 'Volume',
  cvd_confirmation: 'CVD',
  oi_confirmation: 'OI',
  funding: 'Funding',
  long_short_ratio: 'LS Ratio',
  whale_wall: 'Whale',
  support: 'Support',
  resistance: 'Resistance',
  atr: 'ATR',
  spread: 'Spread',
  risk_reward: 'Entry',
  liquidity: 'Liquidity',
  timing: 'Timing',
  execution_readiness: 'Execution',
  rulebook_gate: 'RuleBook',
};

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return ENTRY_QUALITY_EVIDENCE_MISSING;
  return Number(n.toFixed(digits)).toString();
}

function fmtOrMissing(n: number | null | undefined, digits = 2): string {
  return isFiniteNum(n) ? fmtNum(n, digits) : ENTRY_QUALITY_EVIDENCE_MISSING;
}

function emaStackActual(m: EntryQualityMarketSnapshot): string {
  const has3 = isFiniteNum(m.emaFast) && isFiniteNum(m.emaMid) && isFiniteNum(m.emaSlow);
  const has2 = isFiniteNum(m.emaFast) && isFiniteNum(m.emaSlow);
  if (!has3 && !has2) return ENTRY_QUALITY_EVIDENCE_MISSING;

  if (has3) {
    const a = m.emaFast!;
    const b = m.emaMid!;
    const c = m.emaSlow!;
    if (a > b && b > c) return 'EMA20 > EMA50 > EMA200';
    if (a < b && b < c) return 'EMA20 < EMA50 < EMA200';
    return `EMA20=${fmtNum(a)} · EMA50=${fmtNum(b)} · EMA200=${fmtNum(c)}`;
  }

  const a = m.emaFast!;
  const c = m.emaSlow!;
  if (a > c) return 'EMA20 > EMA200';
  if (a < c) return 'EMA20 < EMA200';
  return `EMA20=${fmtNum(a)} · EMA200=${fmtNum(c)}`;
}

function atrPctOf(m: EntryQualityMarketSnapshot): number | null {
  if (isFiniteNum(m.atrPct)) return m.atrPct!;
  if (isFiniteNum(m.atr) && isFiniteNum(m.price) && m.price! > 0) {
    return (m.atr! / m.price!) * 100;
  }
  return null;
}

function fundingPct(rate: number | null | undefined): number | null {
  return isFiniteNum(rate) ? rate! * 100 : null;
}

function whaleActual(m: EntryQualityMarketSnapshot): string {
  const wall = m.whaleWall ?? null;
  const size = m.whaleSizeUsdt;
  if (wall == null && !isFiniteNum(size)) return ENTRY_QUALITY_EVIDENCE_MISSING;
  if (isFiniteNum(size)) {
    const mUsdt = size! / 1_000_000;
    return wall != null ? `${fmtNum(mUsdt, 1)}M ${wall}` : `${fmtNum(mUsdt, 1)}M`;
  }
  return wall ?? ENTRY_QUALITY_EVIDENCE_MISSING;
}

function whaleExpected(side: EntryQualitySide): string {
  return side === 'LONG' ? 'SUPPORT (protective)' : 'RESISTANCE (protective)';
}

type EvidenceParts = {
  actual: string;
  expected: string;
  unit: string;
};

function partsForCheck(
  checkId: EntryQualityCheckId,
  market: EntryQualityMarketSnapshot,
  entry: EntryQualityEntryDecisionInput | null | undefined,
  ruleBook: EntryQualityRuleBookView | null | undefined,
): EvidenceParts {
  const side: EntryQualitySide = entry?.side === 'SHORT' ? 'SHORT' : 'LONG';
  const minRr =
    isFiniteNum(ruleBook?.minRr) && ruleBook!.minRr! > 0
      ? ruleBook!.minRr!
      : ENTRY_QUALITY_RULES.DEFAULT_MIN_RR;

  switch (checkId) {
    case 'ema_alignment':
      return {
        actual: emaStackActual(market),
        expected: side === 'LONG' ? 'Bullish Alignment' : 'Bearish Alignment',
        unit: '',
      };
    case 'ema_slope':
      return {
        actual: market.emaSlope ?? ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: side === 'LONG' ? 'UP' : 'DOWN',
        unit: '',
      };
    case 'trend_direction':
      return {
        actual: market.trendDirection ?? ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: side === 'LONG' ? 'BULL' : 'BEAR',
        unit: '',
      };
    case 'momentum':
      return {
        actual: fmtOrMissing(market.momentum, 2),
        expected: side === 'LONG' ? '>0' : '<0',
        unit: '',
      };
    case 'rsi_zone':
      return {
        actual: fmtOrMissing(market.rsi, 1),
        expected:
          side === 'LONG'
            ? `${ENTRY_QUALITY_RULES.RSI_LONG_LOW}–${ENTRY_QUALITY_RULES.RSI_LONG_HIGH}`
            : `${ENTRY_QUALITY_RULES.RSI_SHORT_LOW}–${ENTRY_QUALITY_RULES.RSI_SHORT_HIGH}`,
        unit: 'RSI',
      };
    case 'macd':
      return {
        actual: fmtOrMissing(market.macdHistogram, 3),
        expected: side === 'LONG' ? '>0' : '<0',
        unit: 'hist',
      };
    case 'volume_confirmation':
      return {
        actual: fmtOrMissing(market.volumeRatio, 2),
        expected: `>=${fmtNum(ENTRY_QUALITY_RULES.VOLUME_PASS, 2)} x MA20`,
        unit: 'ratio',
      };
    case 'cvd_confirmation':
      return {
        actual: market.cvdTrend ?? ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: side === 'LONG' ? 'UP' : 'DOWN',
        unit: '',
      };
    case 'oi_confirmation':
      return {
        actual: fmtOrMissing(market.oiChangePct, 2),
        expected:
          side === 'LONG'
            ? `>=${fmtNum(ENTRY_QUALITY_RULES.OI_PASS, 1)}`
            : `<=-${fmtNum(ENTRY_QUALITY_RULES.OI_PASS, 1)}`,
        unit: '%',
      };
    case 'funding': {
      const pct = fundingPct(market.fundingRate);
      return {
        actual: pct == null ? ENTRY_QUALITY_EVIDENCE_MISSING : fmtNum(pct, 4),
        expected: `<${fmtNum(ENTRY_QUALITY_RULES.FUNDING_WARN * 100, 4)} (adverse)`,
        unit: '%',
      };
    }
    case 'long_short_ratio':
      return {
        actual: fmtOrMissing(market.longShortRatio, 2),
        expected:
          side === 'LONG'
            ? `<${fmtNum(ENTRY_QUALITY_RULES.LS_CROWDED_LONG, 2)}`
            : `>${fmtNum(ENTRY_QUALITY_RULES.LS_CROWDED_SHORT, 2)}`,
        unit: 'ratio',
      };
    case 'whale_wall':
      return {
        actual: whaleActual(market),
        expected: whaleExpected(side),
        unit: isFiniteNum(market.whaleSizeUsdt) ? 'USDT' : '',
      };
    case 'support':
      return {
        actual:
          isFiniteNum(market.price) && isFiniteNum(market.support)
            ? `price=${fmtNum(market.price!)} support=${fmtNum(market.support!)}`
            : ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: side === 'LONG' ? 'Near support' : 'Above support',
        unit: 'price',
      };
    case 'resistance':
      return {
        actual:
          isFiniteNum(market.price) && isFiniteNum(market.resistance)
            ? `price=${fmtNum(market.price!)} resistance=${fmtNum(market.resistance!)}`
            : ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: side === 'LONG' ? 'Below resistance' : 'Near resistance',
        unit: 'price',
      };
    case 'atr': {
      const atrPct = atrPctOf(market);
      return {
        actual: atrPct == null ? ENTRY_QUALITY_EVIDENCE_MISSING : fmtNum(atrPct, 2),
        expected: `<=${fmtNum(ENTRY_QUALITY_RULES.ATR_PASS, 1)}`,
        unit: '%',
      };
    }
    case 'spread':
      return {
        actual: fmtOrMissing(market.spreadPct, 3),
        expected: `<=${fmtNum(ENTRY_QUALITY_RULES.SPREAD_PASS, 2)}`,
        unit: '%',
      };
    case 'liquidity':
      return {
        actual: fmtOrMissing(market.liquidityScore, 0),
        expected: `>=${ENTRY_QUALITY_RULES.LIQUIDITY_PASS}`,
        unit: 'score',
      };
    case 'risk_reward':
      return {
        actual: fmtOrMissing(entry?.plannedRr, 2),
        expected: `>=${fmtNum(minRr, 2)}`,
        unit: 'RR',
      };
    case 'timing': {
      const timing = entry?.timing ?? null;
      const session = market.sessionQuality ?? null;
      const actual =
        timing != null
          ? timing
          : session != null
            ? `session=${session}`
            : ENTRY_QUALITY_EVIDENCE_MISSING;
      return {
        actual,
        expected: 'ON_TIME (or GOOD session)',
        unit: '',
      };
    }
    case 'rulebook_gate':
      return {
        actual: ruleBook?.status ?? ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: 'READY',
        unit: '',
      };
    case 'execution_readiness': {
      const ready = entry?.executionReady;
      return {
        actual:
          ready === true ? 'true' : ready === false ? 'false' : ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: 'true',
        unit: '',
      };
    }
    default:
      return {
        actual: ENTRY_QUALITY_EVIDENCE_MISSING,
        expected: ENTRY_QUALITY_EVIDENCE_MISSING,
        unit: '',
      };
  }
}

/**
 * Build evidence once per check (same order as checks). Pure · deterministic.
 * Does not mutate checks / inputs. Does not change scores.
 */
export function buildEntryQualityEvidence(
  checks: readonly EntryQualityCheck[],
  market: EntryQualityMarketSnapshot | null | undefined,
  entry: EntryQualityEntryDecisionInput | null | undefined,
  ruleBook: EntryQualityRuleBookView | null | undefined,
): EntryQualityEvidence[] {
  const m = market ?? {};
  const seen = new Set<EntryQualityCheckId>();
  const out: EntryQualityEvidence[] = [];

  for (const c of checks) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const parts = partsForCheck(c.id, m, entry, ruleBook);
    out.push({
      checkId: c.id,
      title: c.title,
      status: c.status,
      actual: parts.actual,
      expected: parts.expected,
      unit: parts.unit,
      weight: c.weight,
      reason: c.reason,
      recommendation: c.recommendation,
      source: SOURCE_BY_CHECK[c.id],
    });
  }

  return out;
}

/** Format helper for UI / Coach consumers (read-only). */
export function formatEntryEvidenceLine(e: EntryQualityEvidence): string {
  const unit = e.unit ? ` ${e.unit}` : '';
  return `${e.title} [${e.status}] actual=${e.actual}${unit} expected=${e.expected} (${e.source})`;
}
