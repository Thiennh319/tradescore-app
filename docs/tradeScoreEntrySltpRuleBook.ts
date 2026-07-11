/**
 * Entry / SL / TP Rule Book slice — Audit Package Entry_SLTP only.
 * Slice từ tradeScoreRuleBook.ts — không gồm L1-L11 scoring.
 */

import { TRADE_SCORE_RULE_BOOK_RULE_VERSION } from './tradeScoreRuleBook';

export const TRADE_SCORE_ENTRY_SLTP_RULE_BOOK_VERSION = TRADE_SCORE_RULE_BOOK_RULE_VERSION;

export function getTradeScoreEntrySltpRuleBookText(): string {
  return TRADE_SCORE_ENTRY_SLTP_RULE_BOOK_BODY;
}

const TRADE_SCORE_ENTRY_SLTP_RULE_BOOK_BODY = `TradeScore Version
${TRADE_SCORE_RULE_BOOK_RULE_VERSION}

Scope: Entry / SL / TP / RR / Risk — KHÔNG gồm L1-L11 scoring.

----------------------------------------------------------

LƯU Ý (bắt buộc khi audit Entry/SL/TP):

1. Có 2 hệ Entry Quality độc lập —
   entryZone.quality (GOOD/ACCEPTABLE/RISKY/MISS, từ calculateOptimalEntry)
   vwap.entryQuality (IDEAL/GOOD/NEUTRAL/POOR, từ getVWAPEntrySignal)
   Export ưu tiên entryZone.quality, fallback vwap.entryQuality khi
   entryZone không có giá trị.

2. TRADE_PLAN_V3_CONFIG.RR_TARGETS (RR theo decision band) là
   DEAD PATH — production luôn dùng fixed RR: TP1=2.0× TP2=3.0×
   TP3=4.5× (capitalManagement.ts), KHÔNG đổi theo decision band.

----------------------------------------------------------

ADX Gate

evaluateADXGate() — services/adxGate.ts

BLOCK            | bothChoppy (1H+4H < 15)     | SL×1.0 TP×1.0  severity BLOCK
WARNING mixed TF | 1 TF choppy                 | SL×1.1 TP×0.9  severity WARNING
WARNING RANGING  | regime=RANGING              | SL×1.1 TP×0.85 severity WARNING
OK TRENDING weak | regime=TRENDING             | SL×1.0 TP×1.0  severity OK
BONUS TRENDING STRONG | TRENDING + strength STRONG | SL×0.9 TP×1.2 severity BONUS

Regime từ getADXAnalysis(): CHOPPY <15, RANGING 15–25, TRENDING 25–35 weak, STRONG ≥35

Pipeline: scaleTradePlanByAdxGate() áp TP/SL multiplier SAU base plan, TRƯỚC VWAP overlay.

----------------------------------------------------------

VWAP Rule

NEAR_VWAP     : |price−VWAP| ≤ 0.5%  → entry quality IDEAL
Pullback      : 0.5% < |diff| ≤ 2% + hướng pullback → GOOD
BELOW_BAND2 (LONG) / ABOVE_BAND2 (SHORT) : ngoài 2σ → POOR
Else          : trong bands → NEUTRAL

Constants: VWAP_DEFAULTS.NEAR_THRESHOLD_PCT=0.5, PULLBACK_THRESHOLD_PCT=2.0, MIN_CANDLES=5

Pipeline: applyVWAPEntryToPlan() chỉ khi quality IDEAL/GOOD (V4 plan path).

----------------------------------------------------------

ATR Rule

SL quality (tradePlanV3.ts): <1.2×ATR → TIGHT; >3× → WIDE; else NORMAL

Entry patience & SL ATR× theo decision (TRADE_PLAN_V3_CONFIG):
  SETUP_NGON  : patience 0.2% | SL 1.5×ATR
  VAO_TU_TIN  : patience 0.4% | SL 2.0×ATR
  CO_THE_VAO  : patience 0.6% | SL 2.5×ATR
  CHO_THEM    : patience 1.0% | SL 3.0×ATR

marketMode: TRENDING slFactor=0.9 tpFactor=1.2; RANGING slFactor=1.1 tpFactor=0.8

V4 CVD SL tighten: CVD_SL_TIGHTEN=0.3
Profiles: CVD_DOMINANT, TREND_DOMINANT, BALANCED

----------------------------------------------------------

Structure SL

Lookback default     : 20 nến 4H — STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES
Lookback ADX         : ADX≥35→40, ≥25→30, else 20
MIN_CANDLES_BACK     : 3 (ADX≥35 → 2)
Buffer               : 0.3% — BUFFER_PCT
Cap %                : 3.5% — MAX_STRUCTURE_SL_PCT
Cap ATR              : 4.0× — MAX_STRUCTURE_SL_ATR
Swing neighbor       : 2 bars — SWING_NEIGHBOR_BARS

Pipeline: applyStructureSLToPlans() SAU ADX scale + VWAP overlay.
STRUCTURE khi swing hợp lệ; else ATR_FALLBACK.
invalidatePlanIfStructureRrBelowMin khi RR < MIN_RR_TO_ENTER (2.0).

----------------------------------------------------------

Entry Rule

Entry patience theo Decision Band (xem ATR Rule)
VWAP entry quality: IDEAL / GOOD / NEUTRAL / POOR
V4 CVD profile ảnh hưởng SL multiplier (resolveV4SlMultiplier)

Base entry: calculateOptimalEntry() — EMA20 pullback, S/R, patience fallback.

----------------------------------------------------------

Take Profit Rule

Production fixed RR (capitalManagement.ts):
  TP1 : 2.0× R:R
  TP2 : 3.0× R:R
  TP3 : 4.5× R:R

TRADE_PLAN_V3_CONFIG.RR_TARGETS theo decision — dead path khi production dùng fixedRrTargets

Partial close: TP1 50% | TP2 30% | TP3 20%

primaryRR = tp1.rrRatio sau mọi điều chỉnh SL.

----------------------------------------------------------

Risk Rule

Capital ratios (capitalManagement.ts):
  Size per trade    : 17.65% vốn (sizePercent: 0.1765)
  Max loss per trade: 25% size (maxLossPerTrade: 0.25) ≈ 4.4% vốn
  Max loss per day  : 50% size (maxLossPerDay: 0.5)
  Leverage          : 5×
  Milestone growth  : 30% (milestoneGrowth: 0.3)

MIN_RR_TO_ENTER: 2.0 (TRADE_PLAN_V3_CONFIG)`;
