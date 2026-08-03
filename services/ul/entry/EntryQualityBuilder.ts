/**
 * Task 15.7 — Entry Quality checklist evaluation + report assembly.
 * O(1) relative to trade history. Deterministic. Consume-only.
 */

import type { ULDashboardData } from '../types';
import { buildEntryQualityEvidence } from './EntryExplainability';
import type { EntryQualityEvidence } from './EntryExplainabilityTypes';
import {
  blendPillarScores,
  checkStatusScore,
  decideEntryQuality,
  ENTRY_QUALITY_RULES,
  entryQualityConfidence,
  entryQualityGradeFromScore,
  isFiniteNum,
} from './EntryQualityRules';
import type {
  EntryQualityCheck,
  EntryQualityCheckStatus,
  EntryQualityDecision,
  EntryQualityDetection,
  EntryQualityEntryDecisionInput,
  EntryQualityMarketSnapshot,
  EntryQualityPillarId,
  EntryQualityPillarScore,
  EntryQualityReport,
  EntryQualityRuleBookView,
  EntryQualitySide,
  EntryQualitySummary,
} from './EntryQualityTypes';
import { ENTRY_QUALITY_PILLAR_WEIGHTS, ENTRY_QUALITY_VERSION } from './EntryQualityTypes';

function check(
  partial: Omit<EntryQualityCheck, 'status'> & { status: EntryQualityCheckStatus },
): EntryQualityCheck {
  return partial;
}

function alignedWithSide(
  side: EntryQualitySide,
  bullish: boolean | null,
): EntryQualityCheckStatus {
  if (bullish == null) return 'WARNING';
  if (side === 'LONG') return bullish ? 'PASS' : 'FAIL';
  return bullish ? 'FAIL' : 'PASS';
}

function nearLevel(
  price: number | null | undefined,
  level: number | null | undefined,
  atr: number | null | undefined,
): boolean {
  if (!isFiniteNum(price) || !isFiniteNum(level)) return false;
  const tol = isFiniteNum(atr) && atr > 0 ? atr * 0.5 : Math.abs(price) * 0.005;
  return Math.abs(price - level) <= tol;
}

/**
 * Evaluate all checklist items. Fixed check count — O(1).
 */
export function evaluateEntryChecks(
  market: EntryQualityMarketSnapshot | null | undefined,
  entry: EntryQualityEntryDecisionInput | null | undefined,
  ruleBook: EntryQualityRuleBookView | null | undefined,
): EntryQualityCheck[] {
  const m = market ?? {};
  const side: EntryQualitySide = entry?.side === 'SHORT' ? 'SHORT' : 'LONG';
  const minRr =
    isFiniteNum(ruleBook?.minRr) && ruleBook!.minRr! > 0
      ? ruleBook!.minRr!
      : ENTRY_QUALITY_RULES.DEFAULT_MIN_RR;
  const plannedRr = isFiniteNum(entry?.plannedRr) ? entry!.plannedRr! : null;

  const emaBull =
    isFiniteNum(m.emaFast) && isFiniteNum(m.emaMid) && isFiniteNum(m.emaSlow)
      ? m.emaFast! > m.emaMid! && m.emaMid! > m.emaSlow!
      : isFiniteNum(m.emaFast) && isFiniteNum(m.emaSlow)
        ? m.emaFast! > m.emaSlow!
        : null;
  const emaBear =
    isFiniteNum(m.emaFast) && isFiniteNum(m.emaMid) && isFiniteNum(m.emaSlow)
      ? m.emaFast! < m.emaMid! && m.emaMid! < m.emaSlow!
      : isFiniteNum(m.emaFast) && isFiniteNum(m.emaSlow)
        ? m.emaFast! < m.emaSlow!
        : null;
  const emaAligned =
    side === 'LONG'
      ? emaBull == null
        ? 'WARNING'
        : emaBull
          ? 'PASS'
          : 'FAIL'
      : emaBear == null
        ? 'WARNING'
        : emaBear
          ? 'PASS'
          : 'FAIL';

  const slopeOk =
    m.emaSlope == null
      ? 'WARNING'
      : m.emaSlope === 'FLAT'
        ? 'WARNING'
        : alignedWithSide(side, m.emaSlope === 'UP');

  const trendBull =
    m.trendDirection == null ? null : m.trendDirection === 'BULL' ? true : m.trendDirection === 'BEAR' ? false : null;
  const trendStatus =
    m.trendDirection === 'RANGE'
      ? 'WARNING'
      : alignedWithSide(side, trendBull);

  const mom =
    isFiniteNum(m.momentum)
      ? alignedWithSide(side, m.momentum! > 0)
      : 'WARNING';

  let rsiStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.rsi)) {
    const r = m.rsi!;
    if (side === 'LONG') {
      if (r >= ENTRY_QUALITY_RULES.RSI_LONG_LOW && r <= ENTRY_QUALITY_RULES.RSI_LONG_HIGH) {
        rsiStatus = 'PASS';
      } else if (r > ENTRY_QUALITY_RULES.RSI_OVERBOUGHT) {
        rsiStatus = 'FAIL';
      } else {
        rsiStatus = 'WARNING';
      }
    } else if (r >= ENTRY_QUALITY_RULES.RSI_SHORT_LOW && r <= ENTRY_QUALITY_RULES.RSI_SHORT_HIGH) {
      rsiStatus = 'PASS';
    } else if (r < ENTRY_QUALITY_RULES.RSI_OVERSOLD) {
      rsiStatus = 'FAIL';
    } else {
      rsiStatus = 'WARNING';
    }
  }

  const macd =
    isFiniteNum(m.macdHistogram)
      ? alignedWithSide(side, m.macdHistogram! > 0)
      : 'WARNING';

  let volumeStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.volumeRatio)) {
    if (m.volumeRatio! >= ENTRY_QUALITY_RULES.VOLUME_PASS) volumeStatus = 'PASS';
    else if (m.volumeRatio! >= ENTRY_QUALITY_RULES.VOLUME_WARN) volumeStatus = 'WARNING';
    else volumeStatus = 'FAIL';
  }

  const cvd =
    m.cvdTrend == null || m.cvdTrend === 'FLAT'
      ? 'WARNING'
      : alignedWithSide(side, m.cvdTrend === 'UP');

  let oiStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.oiChangePct)) {
    const oi = m.oiChangePct!;
    if (side === 'LONG') {
      if (oi >= ENTRY_QUALITY_RULES.OI_PASS) oiStatus = 'PASS';
      else if (oi >= ENTRY_QUALITY_RULES.OI_WARN) oiStatus = 'WARNING';
      else oiStatus = 'FAIL';
    } else if (oi <= -ENTRY_QUALITY_RULES.OI_PASS) {
      oiStatus = 'PASS';
    } else if (oi <= ENTRY_QUALITY_RULES.OI_WARN) {
      oiStatus = 'WARNING';
    } else {
      oiStatus = 'FAIL';
    }
  }

  let fundingStatus: EntryQualityCheckStatus = 'PASS';
  if (isFiniteNum(m.fundingRate)) {
    const f = Math.abs(m.fundingRate!);
    const adverse =
      (side === 'LONG' && m.fundingRate! > 0) || (side === 'SHORT' && m.fundingRate! < 0);
    if (f >= ENTRY_QUALITY_RULES.FUNDING_FAIL && adverse) fundingStatus = 'FAIL';
    else if (f >= ENTRY_QUALITY_RULES.FUNDING_WARN && adverse) fundingStatus = 'WARNING';
    else fundingStatus = 'PASS';
  } else {
    fundingStatus = 'WARNING';
  }

  let lsStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.longShortRatio)) {
    const ls = m.longShortRatio!;
    if (side === 'LONG' && ls >= ENTRY_QUALITY_RULES.LS_CROWDED_LONG) lsStatus = 'FAIL';
    else if (side === 'SHORT' && ls <= ENTRY_QUALITY_RULES.LS_CROWDED_SHORT) lsStatus = 'FAIL';
    else if (side === 'LONG' && ls >= 1.15) lsStatus = 'WARNING';
    else if (side === 'SHORT' && ls <= 0.9) lsStatus = 'WARNING';
    else lsStatus = 'PASS';
  }

  let whaleStatus: EntryQualityCheckStatus = 'PASS';
  if (m.whaleWall == null || m.whaleWall === 'NONE') {
    whaleStatus = 'WARNING';
  } else if (side === 'LONG') {
    whaleStatus = m.whaleWall === 'SUPPORT' ? 'PASS' : 'FAIL';
  } else {
    whaleStatus = m.whaleWall === 'RESISTANCE' ? 'PASS' : 'FAIL';
  }

  const supportStatus: EntryQualityCheckStatus =
    side === 'LONG'
      ? nearLevel(m.price, m.support, m.atr)
        ? 'PASS'
        : isFiniteNum(m.support)
          ? 'WARNING'
          : 'WARNING'
      : nearLevel(m.price, m.resistance, m.atr)
        ? 'PASS'
        : 'WARNING';

  const resistanceStatus: EntryQualityCheckStatus =
    side === 'LONG'
      ? isFiniteNum(m.price) && isFiniteNum(m.resistance) && m.price! < m.resistance!
        ? 'PASS'
        : isFiniteNum(m.resistance)
          ? 'WARNING'
          : 'WARNING'
      : isFiniteNum(m.price) && isFiniteNum(m.support) && m.price! > m.support!
        ? 'PASS'
        : 'WARNING';

  let atrStatus: EntryQualityCheckStatus = 'WARNING';
  const atrPct =
    isFiniteNum(m.atrPct)
      ? m.atrPct!
      : isFiniteNum(m.atr) && isFiniteNum(m.price) && m.price! > 0
        ? (m.atr! / m.price!) * 100
        : null;
  if (atrPct != null) {
    if (atrPct <= ENTRY_QUALITY_RULES.ATR_PASS) atrStatus = 'PASS';
    else if (atrPct <= ENTRY_QUALITY_RULES.ATR_WARN) atrStatus = 'WARNING';
    else atrStatus = 'FAIL';
  }

  let spreadStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.spreadPct)) {
    if (m.spreadPct! <= ENTRY_QUALITY_RULES.SPREAD_PASS) spreadStatus = 'PASS';
    else if (m.spreadPct! <= ENTRY_QUALITY_RULES.SPREAD_WARN) spreadStatus = 'WARNING';
    else spreadStatus = 'FAIL';
  }

  let liqStatus: EntryQualityCheckStatus = 'WARNING';
  if (isFiniteNum(m.liquidityScore)) {
    if (m.liquidityScore! >= ENTRY_QUALITY_RULES.LIQUIDITY_PASS) liqStatus = 'PASS';
    else if (m.liquidityScore! >= ENTRY_QUALITY_RULES.LIQUIDITY_WARN) liqStatus = 'WARNING';
    else liqStatus = 'FAIL';
  }

  let rrStatus: EntryQualityCheckStatus = 'WARNING';
  if (plannedRr != null) {
    if (plannedRr >= minRr) rrStatus = 'PASS';
    else if (plannedRr >= minRr * ENTRY_QUALITY_RULES.RR_WARN_RATIO) rrStatus = 'WARNING';
    else rrStatus = 'FAIL';
  }

  const timingRaw = entry?.timing ?? null;
  let timingStatus: EntryQualityCheckStatus = 'WARNING';
  if (timingRaw === 'ON_TIME') timingStatus = 'PASS';
  else if (timingRaw === 'EARLY' || timingRaw === 'LATE') timingStatus = 'WARNING';
  else if (m.sessionQuality === 'GOOD') timingStatus = 'PASS';
  else if (m.sessionQuality === 'POOR') timingStatus = 'FAIL';

  const rb = ruleBook?.status ?? null;
  let rulebookStatus: EntryQualityCheckStatus = 'WARNING';
  if (rb === 'READY') rulebookStatus = 'PASS';
  else if (rb === 'WATCH') rulebookStatus = 'WARNING';
  else if (rb === 'BLOCKED' || rb === 'LOCKED') rulebookStatus = 'FAIL';

  let execStatus: EntryQualityCheckStatus = 'WARNING';
  if (entry?.executionReady === true) execStatus = 'PASS';
  else if (entry?.executionReady === false) execStatus = 'FAIL';
  else if (rb === 'READY') execStatus = 'PASS';

  return [
    check({
      id: 'ema_alignment',
      title: 'EMA Alignment',
      status: emaAligned,
      weight: 8,
      pillar: 'Trend',
      reason:
        emaAligned === 'PASS'
          ? `EMA stack supports ${side}`
          : emaAligned === 'FAIL'
            ? `EMA stack against ${side}`
            : 'EMA stack incomplete',
      recommendation:
        emaAligned === 'FAIL' ? 'Wait for EMA alignment with trade side' : 'Keep EMA stack confirmation',
    }),
    check({
      id: 'ema_slope',
      title: 'EMA Slope',
      status: slopeOk,
      weight: 6,
      pillar: 'Trend',
      reason:
        slopeOk === 'PASS'
          ? `EMA slope favors ${side}`
          : slopeOk === 'FAIL'
            ? `EMA slope against ${side}`
            : 'EMA slope flat or unknown',
      recommendation: slopeOk === 'FAIL' ? 'Avoid fading a clear opposing slope' : 'Confirm slope direction',
    }),
    check({
      id: 'trend_direction',
      title: 'Trend Direction',
      status: trendStatus,
      weight: 8,
      pillar: 'Trend',
      reason:
        trendStatus === 'PASS'
          ? `Trend aligned with ${side}`
          : trendStatus === 'FAIL'
            ? `Trend opposite to ${side}`
            : 'Trend ranging or unknown',
      recommendation: trendStatus === 'FAIL' ? 'Do not enter against primary trend' : 'Prefer trend-aligned entries',
    }),
    check({
      id: 'momentum',
      title: 'Momentum',
      status: mom,
      weight: 4,
      pillar: 'Momentum',
      reason: mom === 'PASS' ? 'Momentum supports side' : mom === 'FAIL' ? 'Momentum against side' : 'Momentum unknown',
      recommendation: mom === 'FAIL' ? 'Wait for momentum flip' : 'Monitor momentum',
    }),
    check({
      id: 'rsi_zone',
      title: 'RSI Zone',
      status: rsiStatus,
      weight: 3,
      pillar: 'Momentum',
      reason:
        rsiStatus === 'PASS'
          ? 'RSI in acceptable zone'
          : rsiStatus === 'FAIL'
            ? 'RSI extreme against entry'
            : 'RSI marginal or missing',
      recommendation: rsiStatus === 'FAIL' ? 'Avoid chasing RSI extremes' : 'Prefer mid-zone RSI',
    }),
    check({
      id: 'macd',
      title: 'MACD',
      status: macd,
      weight: 3,
      pillar: 'Momentum',
      reason: macd === 'PASS' ? 'MACD histogram supports side' : macd === 'FAIL' ? 'MACD against side' : 'MACD unknown',
      recommendation: macd === 'FAIL' ? 'Wait for MACD histogram flip' : 'Confirm MACD',
    }),
    check({
      id: 'volume_confirmation',
      title: 'Volume Confirmation',
      status: volumeStatus,
      weight: 7,
      pillar: 'Volume',
      reason:
        volumeStatus === 'PASS'
          ? 'Volume confirms participation'
          : volumeStatus === 'FAIL'
            ? 'Volume missing / weak'
            : 'Volume soft',
      recommendation: volumeStatus === 'FAIL' ? 'WAIT until volume expands' : 'Prefer rising volume',
    }),
    check({
      id: 'cvd_confirmation',
      title: 'CVD Confirmation',
      status: cvd,
      weight: 5,
      pillar: 'Volume',
      reason: cvd === 'PASS' ? 'CVD aligns' : cvd === 'FAIL' ? 'CVD against side' : 'CVD flat/unknown',
      recommendation: cvd === 'FAIL' ? 'Require CVD confirmation' : 'Watch CVD slope',
    }),
    check({
      id: 'oi_confirmation',
      title: 'OI Confirmation',
      status: oiStatus,
      weight: 3,
      pillar: 'Volume',
      reason: oiStatus === 'PASS' ? 'OI supports move' : oiStatus === 'FAIL' ? 'OI against thesis' : 'OI soft',
      recommendation: oiStatus === 'FAIL' ? 'Wait for OI confirmation' : 'Monitor OI change',
    }),
    check({
      id: 'funding',
      title: 'Funding',
      status: fundingStatus,
      weight: 4,
      pillar: 'Context',
      reason:
        fundingStatus === 'PASS'
          ? 'Funding acceptable'
          : fundingStatus === 'FAIL'
            ? 'Funding extreme against side'
            : 'Funding elevated or unknown',
      recommendation: fundingStatus !== 'PASS' ? 'WARNING — size down on funding risk' : 'Funding ok',
    }),
    check({
      id: 'long_short_ratio',
      title: 'Long Short Ratio',
      status: lsStatus,
      weight: 3,
      pillar: 'Context',
      reason:
        lsStatus === 'PASS'
          ? 'Crowd not extreme'
          : lsStatus === 'FAIL'
            ? 'Crowded side'
            : 'LS ratio soft',
      recommendation: lsStatus === 'FAIL' ? 'Avoid crowded side' : 'Watch crowd skew',
    }),
    check({
      id: 'whale_wall',
      title: 'Whale Wall',
      status: whaleStatus,
      weight: 4,
      pillar: 'Context',
      reason:
        whaleStatus === 'PASS'
          ? 'Whale wall protective'
          : whaleStatus === 'FAIL'
            ? 'Whale wall opposing entry'
            : 'No clear whale wall',
      recommendation: whaleStatus === 'FAIL' ? 'WAIT for wall clearance' : 'Respect whale levels',
    }),
    check({
      id: 'support',
      title: 'Support',
      status: supportStatus,
      weight: 2,
      pillar: 'Context',
      reason: supportStatus === 'PASS' ? 'Near supportive structure' : 'Support distance soft',
      recommendation: 'Prefer entries near protective structure',
    }),
    check({
      id: 'resistance',
      title: 'Resistance',
      status: resistanceStatus,
      weight: 2,
      pillar: 'Context',
      reason: resistanceStatus === 'PASS' ? 'Room to target structure' : 'Resistance proximity soft',
      recommendation: 'Ensure path to target is clear',
    }),
    check({
      id: 'atr',
      title: 'ATR',
      status: atrStatus,
      weight: 4,
      pillar: 'Risk',
      reason:
        atrStatus === 'PASS'
          ? 'Volatility acceptable'
          : atrStatus === 'FAIL'
            ? 'Volatility too high'
            : 'Volatility elevated or unknown',
      recommendation: atrStatus === 'FAIL' ? 'Reduce size or wait for calmer ATR' : 'Size to ATR',
    }),
    check({
      id: 'spread',
      title: 'Spread',
      status: spreadStatus,
      weight: 5,
      pillar: 'Liquidity',
      reason:
        spreadStatus === 'PASS'
          ? 'Spread tight'
          : spreadStatus === 'FAIL'
            ? 'Spread too wide'
            : 'Spread soft',
      recommendation: spreadStatus === 'FAIL' ? 'Avoid wide-spread entries' : 'Prefer tight spreads',
    }),
    check({
      id: 'liquidity',
      title: 'Liquidity',
      status: liqStatus,
      weight: 5,
      pillar: 'Liquidity',
      reason:
        liqStatus === 'PASS'
          ? 'Liquidity adequate'
          : liqStatus === 'FAIL'
            ? 'Liquidity too low'
            : 'Liquidity soft',
      recommendation: liqStatus === 'FAIL' ? 'Avoid low-liquidity names' : 'Prefer liquid venues',
    }),
    check({
      id: 'risk_reward',
      title: 'Risk Reward',
      status: rrStatus,
      weight: 6,
      pillar: 'Risk',
      reason:
        rrStatus === 'PASS'
          ? `RR ≥ ${minRr}`
          : rrStatus === 'FAIL'
            ? `RR below minimum (${minRr})`
            : plannedRr == null
              ? 'RR not provided'
              : `RR marginal vs ${minRr}`,
      recommendation: rrStatus === 'FAIL' ? 'WAIT until RR meets minimum' : 'Keep RR discipline',
    }),
    check({
      id: 'timing',
      title: 'Timing Quality',
      status: timingStatus,
      weight: 10,
      pillar: 'Timing',
      reason:
        timingStatus === 'PASS'
          ? 'Timing on plan'
          : timingRaw === 'LATE'
            ? 'Late entry risk'
            : timingRaw === 'EARLY'
              ? 'Early entry risk'
              : 'Timing soft',
      recommendation:
        timingRaw === 'LATE'
          ? 'Do not chase — wait for next setup'
          : timingRaw === 'EARLY'
            ? 'Wait for trigger confirmation'
            : 'Enter on planned trigger only',
    }),
    check({
      id: 'rulebook_gate',
      title: 'RuleBook Gate',
      status: rulebookStatus,
      weight: 5,
      pillar: 'Execution',
      reason:
        rulebookStatus === 'PASS'
          ? 'RuleBook READY'
          : rulebookStatus === 'FAIL'
            ? `RuleBook ${rb ?? 'blocked'}`
            : 'RuleBook WATCH or unknown',
      recommendation: rulebookStatus === 'FAIL' ? 'Honor RuleBook block' : 'Clear RuleBook before size-up',
    }),
    check({
      id: 'execution_readiness',
      title: 'Execution Readiness',
      status: execStatus,
      weight: 5,
      pillar: 'Execution',
      reason:
        execStatus === 'PASS'
          ? 'Execution ready'
          : execStatus === 'FAIL'
            ? 'Execution not ready'
            : 'Execution readiness unknown',
      recommendation: execStatus === 'FAIL' ? 'Prepare orders before entry' : 'Confirm fills/slippage plan',
    }),
  ];
}

export function buildPillarScores(checks: readonly EntryQualityCheck[]): EntryQualityPillarScore[] {
  const byPillar = new Map<EntryQualityPillarId, EntryQualityCheck[]>();
  for (const c of checks) {
    const list = byPillar.get(c.pillar) ?? [];
    list.push(c);
    byPillar.set(c.pillar, list);
  }

  const ids = Object.keys(ENTRY_QUALITY_PILLAR_WEIGHTS) as EntryQualityPillarId[];
  return ids.map((id) => {
    const list = byPillar.get(id) ?? [];
    let sum = 0;
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    for (const c of list) {
      sum += checkStatusScore(c.status);
      if (c.status === 'PASS') passCount += 1;
      else if (c.status === 'WARNING') warnCount += 1;
      else failCount += 1;
    }
    const score = list.length === 0 ? 0 : Math.round(sum / list.length);
    return {
      id,
      weight: ENTRY_QUALITY_PILLAR_WEIGHTS[id],
      score,
      checkCount: list.length,
      passCount,
      warnCount,
      failCount,
    };
  });
}

export function collectDetections(
  checks: readonly EntryQualityCheck[],
  entry: EntryQualityEntryDecisionInput | null | undefined,
): EntryQualityDetection[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const out: EntryQualityDetection[] = [];
  const push = (d: EntryQualityDetection) => {
    if (!out.includes(d)) out.push(d);
  };

  if (entry?.timing === 'LATE') push('Late Entry');
  if (entry?.timing === 'EARLY') push('Early Entry');
  if (byId.get('trend_direction')?.status === 'FAIL') push('Against Trend');
  if (
    byId.get('ema_alignment')?.status === 'FAIL' ||
    byId.get('ema_slope')?.status === 'FAIL' ||
    byId.get('trend_direction')?.status === 'WARNING'
  ) {
    push('Weak Trend');
  }
  if (byId.get('volume_confirmation')?.status === 'FAIL') push('Weak Volume');
  if (
    byId.get('cvd_confirmation')?.status === 'FAIL' ||
    byId.get('oi_confirmation')?.status === 'FAIL' ||
    (byId.get('volume_confirmation')?.status !== 'PASS' &&
      byId.get('cvd_confirmation')?.status !== 'PASS')
  ) {
    push('No Confirmation');
  }
  if (byId.get('funding')?.status === 'FAIL' || byId.get('funding')?.status === 'WARNING') {
    push('Funding Risk');
  }
  if (byId.get('whale_wall')?.status === 'FAIL') push('Whale Resistance');
  if (byId.get('risk_reward')?.status === 'FAIL') push('Poor RR');
  if (byId.get('spread')?.status === 'FAIL') push('High Spread');
  if (byId.get('atr')?.status === 'FAIL') push('High Volatility');
  if (byId.get('liquidity')?.status === 'FAIL') push('Low Liquidity');

  return out;
}

export function resolveBlockers(
  checks: readonly EntryQualityCheck[],
  ruleBook: EntryQualityRuleBookView | null | undefined,
): { hardAvoid: boolean; hardWait: boolean; blockedReasons: string[] } {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const blockedReasons: string[] = [];

  const trendFail = byId.get('trend_direction')?.status === 'FAIL';
  const rrFail = byId.get('risk_reward')?.status === 'FAIL';
  const volumeFail = byId.get('volume_confirmation')?.status === 'FAIL';
  const whaleFail = byId.get('whale_wall')?.status === 'FAIL';
  const rbBlocked =
    ruleBook?.status === 'BLOCKED' ||
    ruleBook?.status === 'LOCKED' ||
    byId.get('rulebook_gate')?.status === 'FAIL';

  if (trendFail) blockedReasons.push('Trend opposite → AVOID');
  if (rrFail) blockedReasons.push('RR below minimum → WAIT');
  if (volumeFail) blockedReasons.push('Volume missing → WAIT');
  if (whaleFail) blockedReasons.push('Whale wall → WAIT');
  if (byId.get('funding')?.status === 'FAIL' || byId.get('funding')?.status === 'WARNING') {
    blockedReasons.push('Funding extreme → WARNING');
  }
  if (rbBlocked) blockedReasons.push('RuleBook blocked → AVOID');

  if (Array.isArray(ruleBook?.blockedReasons)) {
    for (const r of ruleBook!.blockedReasons!) {
      if (r && !blockedReasons.includes(r)) blockedReasons.push(r);
    }
  }

  const hardAvoid = trendFail || rbBlocked;
  const hardWait = !hardAvoid && (rrFail || volumeFail || whaleFail);

  return { hardAvoid, hardWait, blockedReasons };
}

/** O(1) historical reliability from dashboard KPIs only — never iterates trades. */
export function historicalReliabilityFromDashboard(
  dashboard: ULDashboardData | null | undefined,
): number | null {
  if (dashboard == null) return null;
  const wr = dashboard.metrics?.winRate;
  const cons = dashboard.metrics?.consistencyScore;
  const pf = dashboard.metrics?.profitFactor;
  if (!isFiniteNum(wr) && !isFiniteNum(cons) && !isFiniteNum(pf)) return null;
  const wrPart = isFiniteNum(wr) ? Math.max(0, Math.min(100, wr)) : 50;
  const consPart = isFiniteNum(cons) ? Math.max(0, Math.min(100, cons)) : 50;
  const pfPart = isFiniteNum(pf) ? Math.max(0, Math.min(100, (pf / 2) * 100)) : 50;
  return Math.round(wrPart * 0.4 + consPart * 0.35 + pfPart * 0.25);
}

export function assembleEntryQualityReport(
  checks: readonly EntryQualityCheck[],
  pillars: readonly EntryQualityPillarScore[],
  detections: readonly EntryQualityDetection[],
  blockers: { hardAvoid: boolean; hardWait: boolean; blockedReasons: string[] },
  confidence: number,
  decision: EntryQualityDecision,
  evidence: readonly EntryQualityEvidence[] = [],
): EntryQualityReport {
  const scoreMap = new Map<EntryQualityPillarId, number>();
  for (const p of pillars) scoreMap.set(p.id, p.score);
  const score = blendPillarScores(scoreMap);
  const grade = entryQualityGradeFromScore(score);

  const passedChecks = checks.filter((c) => c.status === 'PASS');
  const failedChecks = checks.filter((c) => c.status === 'FAIL');
  const warnChecks = checks.filter((c) => c.status === 'WARNING');

  const strengths = passedChecks.map((c) => c.title);
  const weaknesses = [...new Set([...failedChecks.map((c) => c.title), ...detections])];

  const recommendations = [
    ...failedChecks.map((c) => c.recommendation),
    ...warnChecks.filter((c) => c.id === 'funding' || c.id === 'timing').map((c) => c.recommendation),
  ].filter((r, i, arr) => arr.indexOf(r) === i);

  const summary: EntryQualitySummary = {
    headline:
      decision === 'ENTER'
        ? `Entry quality ${grade} — ENTER`
        : decision === 'WAIT'
          ? `Entry quality ${grade} — WAIT`
          : `Entry quality ${grade} — AVOID`,
    checkCount: checks.length,
    passCount: passedChecks.length,
    warnCount: warnChecks.length,
    failCount: failedChecks.length,
    blockerCount: blockers.blockedReasons.length,
    topDetection: detections[0] ?? null,
  };

  return {
    version: ENTRY_QUALITY_VERSION,
    summary,
    score,
    grade,
    confidence,
    decision,
    strengths,
    weaknesses,
    passedChecks,
    failedChecks,
    blockedReasons: blockers.blockedReasons,
    recommendations,
    pillars,
    checks,
    detections,
    evidence,
  };
}

export function buildEntryQualityFromInputs(
  market: EntryQualityMarketSnapshot | null | undefined,
  entry: EntryQualityEntryDecisionInput | null | undefined,
  ruleBook: EntryQualityRuleBookView | null | undefined,
  dashboard: ULDashboardData | null | undefined,
): EntryQualityReport {
  const checks = evaluateEntryChecks(market, entry, ruleBook);
  const pillars = buildPillarScores(checks);
  const detections = collectDetections(checks, entry);
  const blockers = resolveBlockers(checks, ruleBook);

  const scoreMap = new Map<EntryQualityPillarId, number>();
  for (const p of pillars) scoreMap.set(p.id, p.score);
  const score = blendPillarScores(scoreMap);

  const decision = decideEntryQuality({
    hardAvoid: blockers.hardAvoid,
    hardWait: blockers.hardWait,
    score,
  });

  const passCount = checks.filter((c) => c.status === 'PASS').length;
  const warnCount = checks.filter((c) => c.status === 'WARNING').length;
  const failCount = checks.filter((c) => c.status === 'FAIL').length;
  const confidence = entryQualityConfidence({
    passCount,
    warnCount,
    failCount,
    historicalReliability: historicalReliabilityFromDashboard(dashboard),
  });

  // Evidence is generated once after scoring — never feeds back into score/decision.
  const evidence = buildEntryQualityEvidence(checks, market, entry, ruleBook);

  return assembleEntryQualityReport(
    checks,
    pillars,
    detections,
    blockers,
    confidence,
    decision,
    evidence,
  );
}
