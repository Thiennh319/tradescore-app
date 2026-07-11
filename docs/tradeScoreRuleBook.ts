/**
 * TradeScore Rule Book — single source of truth for Audit Package (GĐ2).
 * Nội dung lấy từ docs/RULE_REFERENCE.txt — không tự viết Rule mới.
 * Khi Rule Document đổi, cập nhật file này đồng bộ.
 */

export const TRADE_SCORE_RULE_BOOK_RULE_VERSION = 'TradeScore V4';

export function getTradeScoreRuleBookText(): string {
  return TRADE_SCORE_RULE_BOOK_BODY;
}

const TRADE_SCORE_RULE_BOOK_BODY = `TradeScore Version
${TRADE_SCORE_RULE_BOOK_RULE_VERSION}

----------------------------------------------------------

LAYER 1 — Giá & EMA (Slope)

File: scorerV3.ts / scorerV4.ts (logic giống nhau)
Điểm raw: min=0 max=2

LONG:
  2đ: giá trên EMA20/50 cả 1H+4H và slope UP ít nhất 1 khung
  1.5đ: trên EMA cả 2 khung, slope phẳng
  1đ: pullback về EMA (|priceVsEma20Pct| < 2 trên 1H hoặc 4H) khi 1 khung thuận
  L1_MTF_CONFLICT_RAW (~1.333): mâu thuẫn 1H vs 4H
  0đ: giá dưới tất cả EMA

SHORT: đối xứng (dưới EMA, slope DOWN)

Constant: L1_MTF_CONFLICT_RAW = 2 / LAYER_MAX_POINTS
Magic number: 2% pullback EMA
Hard Block: Không (chỉ warnings nếu l1.score < 2)

----------------------------------------------------------

LAYER 2 — RSI 14 + Divergence

File: scorerV3.ts / scorerV4.ts (logic giống nhau)
Điểm raw: min=0 max=2

LONG:
  Sweet zone RSI 45–65 (cả 1H+4H) → 2đ
  OK zone 35–45 hoặc 65–75 (một khung) → 1đ
  RSI 1H < 30 + Bullish divergence → 1.5đ
  Divergence bullish + score>0 → +0.5 (cap 2)
  NaN RSI → 1đ fallback

SHORT:
  Sweet 35–55; OK 25–35 hoặc 55–65
  RSI 1H > 70 + Bearish divergence → 1.5đ
  Bearish div bonus +0.5

Hard Block: Không

----------------------------------------------------------

LAYER 3 — MACD + Histogram Momentum

File: scorerV3.ts / scorerV4.ts (logic giống nhau)
Điểm raw: min=0 max=2

LONG: h1>0 && h4>0 → 2; zero cross up → 1.5; turning up combos → 1–1.5; 1 khung thuận → 1; cả 2 âm → 0
SHORT: h1>0 && h4>0 → 0 (VI PHẠM); h1<0 && h4<0 → 2; zero cross down / turning down → 1–1.5

Hard Block: l3.score < 1 → L3 MACD vi phạm

----------------------------------------------------------

LAYER 4 — Bollinger %B + Bandwidth

File: scorerV3.ts / scorerV4.ts (logic giống nhau)
Điểm raw: min=0 max=2
Phụ thuộc marketMode (TRENDING/RANGING) và %B bands

LONG TRENDING: 60–90→2, 40–60→1.5, 20–40→0.5
LONG RANGING: 35–55→2, 55–70→1, 20–35→1
SHORT TRENDING: 10–40→2, 40–60→1.5, >70→0
SHORT RANGING: <30→0, >80→0, 45–65→2, 30–45/65–80→1

Hard Block: Không

----------------------------------------------------------

LAYER 5 — Volume / OI / CVD

V3: một layer id=5 — Vol (≥1.5×→+1, ≥1.2×→+0.5), OI deltas (+1/0.3/-0.5), CVD aligned (+1); CVD divergence ngược → score=0
V4 L5a: CVD strength bắt buộc; hard block CVD; raw < 1 → blockReasons
V4 L5b: chỉ Vol/OI (LAYER_L5B_ID=52)

Hard Block V4 L5a: CVD LONG (STRONG_BEARISH + price < EMA20); CVD SHORT > CVD_SHORT_HARD_BLOCK (+2M)
Score Block V4: L5a raw < 1 → blockReasons

----------------------------------------------------------

LAYER 6 — Funding Rate

V3: tier theo currentRate và trend — 0.005, 0.01; max raw 2
V4 (có fundingMetrics): classifyFundingState() → LONG_L6_BY_STATE / SHORT_L6_BY_STATE; max raw 2
V4 fallback: scoreL6V4Legacy — tier 0.005/0.01, max raw 1

Hard Block: extremeRisk LONG_SQUEEZE (rate > 0.03%) chặn LONG; SHORT_SQUEEZE (< -0.03%) chặn SHORT
Constant: FUNDING_LONG/SHORT_SQUEEZE_PCT

----------------------------------------------------------

LAYER 7 — L/S Ratio + Whale Wall

File: scorerV3.ts / scorerV4.ts (cùng scoreL7FlowWithWhaleConfirmation)
Điểm raw: min=0 max=2
Hard Block: Không (L/S extreme chỉ warning)
Warning: LS_RATIO_EXTREME_HIGH (>3.0) / LOW (<0.5)

----------------------------------------------------------

LAYER 8 — BTC 24h + 1H Momentum

File: scorerV3.ts / scorerV4.ts (logic giống nhau)
Điểm raw: min=0 max=2

Hard Block:
  BTC_EXTREME_PCT (|24h|>8%)
  BTC_LONG_BLOCK_PCT (24h ≤ -2% chặn LONG)
  BTC_SHORT_BLOCK_PCT (24h ≥ +2% chặn SHORT)

Soft scoring: change1h ±0.3, change24h ±0.5

----------------------------------------------------------

LAYER 9 — Phiên giao dịch

File: getSessionScoreV3() — SESSION_RULES_V3
London Open/NY Peak 2đ, Overlap 1.5đ, Lunch 1đ, NY Close 1đ, Asia Dead 0đ
V4 khác: CHO_TAI_CHAM khi chỉ L9 block

Hard Block: l9.score < 0.5 → L9 Phiên xấu

----------------------------------------------------------

LAYER 10 — Tâm lý & Kỷ luật

Checklist: 5 mục PSYCHOLOGY_CHECKLIST_V3_ITEMS
Điểm: 5/5→2, 4/5→1.5, ≥3→1, ≥2→0.5
Win streak: WIN_STREAK_CONFIG.warningThreshold=4 → trừ 0.5đ + warning

Hard Block (active): l10.score < 1 → L10 Tâm lý chưa sẵn sàng
Hard Block COMMENT OUT: loss streak ≥3/24h + cooldown 180'; daily loss ≥3 USDT — TẮT V3+V4

----------------------------------------------------------

LAYER 11 — Squeeze Risk (V4 only)

File: scorerV4.ts → calculateSqueezeRisk() (squeezeRiskEngine.ts)
Không cộng vào thang 15đ (squeezeRisk riêng)
Score: 0–10 (≥9 EXTREME, ≥6 HIGH, ≥3 MEDIUM, else LOW)
Hard Block: Không trực tiếp trong scorer (ảnh hưởng Plan Health / PA)

----------------------------------------------------------

Decision Band

Nguồn: scoreAnalysisV3() / resolveDecision() — literal, KHÔNG đọc SCORE_THRESHOLDS

SETUP_NGON  : score ≥ 11.5
VAO_TU_TIN  : score ≥ 10.0
CO_THE_VAO  : score ≥ 9.0
CHO_THEM    : score ≥ 8.0
KHONG_VAO   : score < 8.0 hoặc bị block

Chỉ tính khi không bị hard block / group block (V3) hoặc hard block / group block / blockReasons (V4)
V4 thêm: CHO_TAI_CHAM — chỉ L9 phiên xấu block, điểm đủ cao nếu bỏ L9

----------------------------------------------------------

Hard Block

BTC extreme          | |24h| > 8%           | BTC_EXTREME_PCT
BTC LONG block       | 24h ≤ -2%            | BTC_LONG_BLOCK_PCT
BTC SHORT block      | 24h ≥ +2%            | BTC_SHORT_BLOCK_PCT
Funding LONG squeeze | rate > 0.03%         | FUNDING_LONG_SQUEEZE_PCT
Funding SHORT squeeze| rate < -0.03%        | FUNDING_SHORT_SQUEEZE_PCT
L3 MACD LONG         | h1≤0 && h4≤0 score<1 | logic dấu
L3 MACD SHORT        | h1>0 && h4>0 score=0 | logic dấu
L9 session xấu     | score < 0.5          | getSessionScoreV3
L10 psychology       | score < 1            | checklist
ADX bothChoppy       | cả 1H+4H ADX < 15   | ADX_CHOPPY_THRESHOLD
CVD LONG HB (V4)     | STRONG_BEARISH + price < EMA20
CVD SHORT HB (V4)    | CVD > +2M            | CVD_SHORT_HARD_BLOCK

Hard Block COMMENT OUT (TODO PRODUCTION):
  Loss streak ≥3 lệnh thua/24h → cooldown 180'
  Daily loss ≥3 USDT/ngày → block

----------------------------------------------------------

Group Block

Group A (Trend)  : min 2.5/5đ — SCORING_GROUPS_V3/V4.GROUP_A_TREND.minRequired
Group B (Flow)   : min 2.0/5đ — GROUP_B_FLOW.minRequired
Group C (Risk)   : min 2.0/5đ — GROUP_C_CONTEXT.minRequired

V4 Group B rawMax=8 (L5a+L5b+L6+L7); V3 rawMax=6 (L5+L6+L7)

Score Block V4 only:
  L5a CVD: layerResult.score < 1 → blockReasons (không hardBlocks)

----------------------------------------------------------

ADX Gate

evaluateADXGate() — services/adxGate.ts

BLOCK            | bothChoppy (1H+4H < 15)     | SL×1.0 TP×1.0  severity BLOCK
WARNING mixed TF | 1 TF choppy                 | SL×1.1 TP×0.9  severity WARNING
WARNING RANGING  | regime=RANGING              | SL×1.1 TP×0.85 severity WARNING
OK TRENDING weak | regime=TRENDING             | SL×1.0 TP×1.0  severity OK
BONUS TRENDING STRONG | TRENDING + strength STRONG | SL×0.9 TP×1.2 severity BONUS

Regime từ getADXAnalysis(): CHOPPY <15, RANGING 15–25, TRENDING 25–35 weak, STRONG ≥35

----------------------------------------------------------

VWAP Rule

NEAR_VWAP     : |price−VWAP| ≤ 0.5%  → entry quality IDEAL
Pullback      : 0.5% < |diff| ≤ 2% + hướng pullback → GOOD
BELOW_BAND2 (LONG) / ABOVE_BAND2 (SHORT) : ngoài 2σ → POOR
Else          : trong bands → NEUTRAL

Constants: VWAP_DEFAULTS.NEAR_THRESHOLD_PCT=0.5, PULLBACK_THRESHOLD_PCT=2.0, MIN_CANDLES=5
Bonus L5: calculateVWAPBonus() +0.5 raw max khi isNearVwap + CVD đúng hướng + headroom L5

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

----------------------------------------------------------

Entry Rule

Entry patience theo Decision Band (xem ATR Rule)
VWAP entry quality: IDEAL / GOOD / NEUTRAL / POOR
V4 CVD profile ảnh hưởng SL multiplier

Direction selection waterfall:
  V3 suggestDirectionV3 / V4 suggestDirectionV4
  Rules: hardBlocks ưu tiên, awaitingRescore (V4), KHONG_VAO, longScore ≥ shortScore

Ambiguous direction (directionAmbiguity.ts):
  AMBIGUOUS_THRESHOLD = 1.0đ
  Vào AMBIGUOUS: scoreDiff < 1.0 trong ≥2 scan liên tiếp
  Thoát: scoreDiff ≥ 1.0 trong ≥2 scan

----------------------------------------------------------

Take Profit Rule

Production fixed RR (capitalManagement.ts):
  TP1 : 2.0× R:R
  TP2 : 3.0× R:R
  TP3 : 4.5× R:R

TRADE_PLAN_V3_CONFIG.RR_TARGETS theo decision — dead path khi production dùng fixedRrTargets

----------------------------------------------------------

Risk Rule

Capital ratios (capitalManagement.ts):
  Size per trade    : 17.65% vốn (sizePercent: 0.1765)
  Max loss per trade: 25% size (maxLossPerTrade: 0.25) ≈ 4.4% vốn
  Max loss per day  : 50% size (maxLossPerDay: 0.5)
  Leverage          : 5×
  Milestone growth  : 30% (milestoneGrowth: 0.3)

Plan expiry (tradePlanExpiry.ts):
  HIGH   : score ≥ 13 → TTL 12h
  MEDIUM : score ≥ 11 → TTL 8h
  LOW    : score < 11 → TTL 4h

Plan Health penalties: SQUEEZE_EXTREME −30, CVD_DIVERGENCE −25, FUNDING_REVERSAL −20, MACD_REVERSAL −20, RSI_EXTREME −15
Status: ≤25 CRITICAL, ≤55 WEAK, ≤85 NORMAL, else STRONG
autoCancel: ≥3 tín hiệu đồng thời hoặc CRITICAL`;
