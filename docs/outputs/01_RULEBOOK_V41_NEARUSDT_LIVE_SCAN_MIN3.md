# 01_RULEBOOK_V41 (V4.1)

## METADATA
Document Version: v41-export-1
Generated At: 2026-07-26T12:03:43.212Z
Filename: 01_RULEBOOK_V41_NEARUSDT.md
Symbol: NEARUSDT
Trade Id: UNAVAILABLE
Side: UNAVAILABLE
Engine Version: 1.0.8
Build Info Version: 1.0.8

---

## INPUT SNAPSHOT
Symbol: NEARUSDT
Scan Timestamp (ms): 1785067423184
Fetched At (ms): 1785067423184
Row Error: UNAVAILABLE
Trend Strength: 90
Trend Direction: BEAR
Trend Exhaustion (4H MI): 10
Volume Divergence Pts: 0
Reversal Probability: 4
Market Confidence: 81
Market State: StrongDowntrend
Visibility Mode: TRADE_MODE
Early Warning Severity: WARNING_SOFT
Momentum Confirmed Long: NO
Momentum Confirmed Short: NO
Funding Rate: -0.0000385
Has Klines 1H: YES
Has Klines 4H: YES
Has BTC Klines 4H: YES

---

## RULE TRACE

### Rule 01 — cvd_flip

Name: CVD Flip
Stage: trend_reversal
Status: FAIL
Actual: NO
Threshold: BULL:(+,+,−) | BEAR:(−,−,+) — detectCvdFlip (không có ngưỡng magnitude)
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cần ≥3/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext → signals.cvdFlip / detail.cvdLast3 (detectCvdFlip)
Reason (VI): CVD proxy 3 nến cuối không khớp pattern đảo chiều (hoặc NEUTRAL/<3 nến)
Evidence:
- cvdLast3[0]=3038
- cvdLast3[1]=-130200
- cvdLast3[2]=-106960
--------------------------------

### Rule 02 — volume_confirmation

Name: Volume Confirmation
Stage: trend_reversal
Status: FAIL
Actual: 0.8118031600615432
Threshold: 1.2
Unit: ratio vs MA20
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cần ≥3/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext → signals.volumeConfirmation / detail.volumeRatio
Reason (VI): volumeRatio 0.8118031600615432 ≤ 1.2 hoặc thiếu nến cho MA20
Evidence:
- volumeRatio=0.8118031600615432
- volumeConfirmation=false
--------------------------------

### Rule 03 — trend_exhaustion_gate

Name: Trend Exhaustion Gate
Stage: trend_reversal
Status: FAIL
Actual: 0
Threshold: 55
Unit: pts (1H Task-2)
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cần ≥3/4 signals)
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext → signals.trendExhaustion / detail.trendExhaustion (1H)
Reason (VI): trendExhaustion(1H) 0 < 55
Evidence:
- trendExhaustion_1H=0
- note=KHÔNG dùng snapshot.trendExhaustion (4H MI)
--------------------------------

### Rule 04 — structure_break

Name: Structure Break
Stage: trend_reversal
Status: PASS
Actual: LL_HL
Threshold: lookback=50; BULL:HH→LH | BEAR:LL→HL
Unit: UNAVAILABLE
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE (cần ≥3/4 signals) — ẨN khỏi checklist UI
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext → signals.structureBreak / detectStructureBreak (PHẢI gọi lại — không có trên row)
Reason (VI): Structure break xác nhận (LL_HL)
Evidence:
- structureBreakType=LL_HL
- olderSwingPrice=1.784
- newerSwingPrice=1.786
- structureBreak=true
--------------------------------

### Rule 05 — trend_reversal_confidence

Name: Trend Reversal Confidence
Stage: trend_reversal
Status: WATCH
Actual: 17.5
Threshold: 70
Unit: %
Source Module: services/v41/reversalDetector.ts
Gates: ACTIVE
Data Source: pure_recall
Data Source Detail: evaluateTrendReversalWithContext → state / detail.confidence (resolveTrendReversalState)
Reason (VI): State=WATCH: cần ≥3/4 signals và confidence ≥ 70 (TREND_REVERSAL_CONFIDENCE_MIN)
Evidence:
- state=WATCH
- confidence=17.5
- activeConditionCount=1
- cvdFlip=false
- volumeConfirmation=false
- trendExhaustion=false
- structureBreak=true
--------------------------------

### Rule 06 — market_context_btc

Name: Market Context — BTC
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: 75
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giữ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.btc
Reason (VI): Market Context không áp dụng (Trend Reversal ≠ ACTIVE). BTC BEAR moderate — chưa đồng thuận đảo chiều
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=BTC dump — phủ định đảo bullish
- thresholdNote=BTC_STRONG_THRESHOLD=75; strong band hoặc strength≥75
- fundingRate_row=-0.0000385
--------------------------------

### Rule 07 — market_context_funding

Name: Market Context — Funding
Stage: market_context
Status: SKIPPED
Actual: YES
Threshold: 0.0003
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giữ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.funding
Reason (VI): Market Context không áp dụng (Trend Reversal ≠ ACTIVE). Funding -0.004% — trong vùng trung tính
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=UNAVAILABLE
- dim.title=Funding trung tính
- thresholdNote=FUNDING_EXTREME_THRESHOLD=±0.0003
- fundingRate_row=-0.0000385
--------------------------------

### Rule 08 — market_context_oi

Name: Market Context — OI
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: 1.5/-1.5
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giữ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.oi
Reason (VI): Market Context không áp dụng (Trend Reversal ≠ ACTIVE). Open Interest không khả dụng — không chặn ACTIVE không có data trên row (production scan không fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=OI — không có dữ liệu
- thresholdNote=OI_BUILDUP_PCT=1.5; OI_DECLINE_PCT=-1.5 — production scan KHÔNG có oiDeltaPct → thường skipped
- fundingRate_row=-0.0000385
- noDataOnRow=true
--------------------------------

### Rule 09 — market_context_whale

Name: Market Context — Whale
Stage: market_context
Status: SKIPPED
Actual: skipped:true
Threshold: whale.blocksReversal / signal enum
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giữ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.whale
Reason (VI): Market Context không áp dụng (Trend Reversal ≠ ACTIVE). Không có tín hiệu whale không có data trên row (production scan không fetch OI/Whale)
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=true
- dim.skipped=true
- dim.title=Whale không phủ định
- thresholdNote=Production scan KHÔNG fetch whale → thường skipped
- fundingRate_row=-0.0000385
- noDataOnRow=true
--------------------------------

### Rule 10 — market_context_volatility

Name: Market Context — Volatility
Stage: market_context
Status: SKIPPED
Actual: NO
Threshold: NORMAL pass; LOW/HIGH/EXTREME fail
Unit: UNAVAILABLE
Source Module: services/v41/marketContextFilter.ts
Gates: Giữ ACTIVE / downgrade WATCH khi fail
Data Source: pure_recall
Data Source Detail: evaluateMarketContext (display) + status SKIPPED vì TR≠ACTIVE — dimensions.volatility
Reason (VI): Market Context không áp dụng (Trend Reversal ≠ ACTIVE). ATR ratio 75.6% — thị trường quá nén
Evidence:
- contextApplied=false
- preContextState=UNAVAILABLE
- trState=WATCH
- dim.pass=false
- dim.skipped=UNAVAILABLE
- dim.title=Volatility quá thấp — không giao dịch
- thresholdNote=computeVolatilityRisk(klines4H) qua evaluateVolatilityMarketContext
- fundingRate_row=-0.0000385
--------------------------------

### Rule 11 — decision_long_short

Name: Decision LONG/SHORT Threshold
Stage: decision
Status: FAIL
Actual: 12.909375
Threshold: ≥ 75
Unit: %
Source Module: services/v41/decision/decisionConfig.ts (thresholds.long/short)
Gates: LONG | SHORT confidence band
Data Source: pure_recall
Data Source Detail: Status = actual≥thresholds.long (75) — Method A partition; không so decision label
Reason (VI): actual 12.909375 < 75 — ngoài band LONG/SHORT
Evidence:
- confidence=12.909375
- threshold_long_short=75
- partition=[75, 100]
- engineDecision_notUsedForStatus=IGNORE
- proposedDirection=LONG
- eligible=false
--------------------------------

### Rule 12 — decision_watch

Name: Decision WATCH Threshold
Stage: decision
Status: FAIL
Actual: 12.909375
Threshold: 45 ≤ x < 75
Unit: %
Source Module: services/v41/decision/decisionConfig.ts (thresholds.watch/long)
Gates: WATCH confidence band
Data Source: pure_recall
Data Source Detail: Status = thresholds.watch ≤ actual < thresholds.long — Method A; chặn trên tránh chồng long
Reason (VI): actual 12.909375 ∉ [45, 75) — ngoài band WATCH
Evidence:
- confidence=12.909375
- threshold_watch_lo=45
- threshold_watch_hi_exclusive=75
- partition=[45, 75)
- engineDecision_notUsedForStatus=IGNORE
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 13 — decision_ignore

Name: Decision IGNORE Threshold
Stage: decision
Status: PASS
Actual: 12.909375
Threshold: < 45 (band IGNORE; config.ignore=25 = isIgnoreCase floor)
Unit: %
Source Module: services/v41/decision/decisionConfig.ts + decisionEngine ladder
Gates: IGNORE confidence band
Data Source: pure_recall
Data Source Detail: Status = actual < thresholds.watch (45) — Method A; config.ignore=25 chỉ phân nhánh reasonVi
Reason (VI): Không đủ tín hiệu — dưới ngưỡng ignore gốc (25), gần như không có dữ liệu hỗ trợ hướng đi
Evidence:
- confidence=12.909375
- threshold_ignore_band_hi_exclusive=45
- threshold_ignore_config_floor=25
- partition=[0, 45)
- engineDecision_notUsedForStatus=IGNORE
- altTrendDirection=BEAR
- trendSignalCount=1
- completenessMultiplier=0.45
--------------------------------

### Rule 14 — decision_final_output

Name: Decision Final Output (engine)
Stage: decision
Status: INFO
Actual: IGNORE
Threshold: UNAVAILABLE
Unit: UNAVAILABLE
Source Module: services/v41/decisionEngine.ts (evaluateDecision → state)
Gates: Descriptive — matchedTier cho AI Review CRITICAL check
Data Source: pure_recall
Data Source Detail: computeDecisionEngineResult → state; Status luôn INFO
Reason (VI): Engine decision cuối = IGNORE (mô tả only; không so threshold)
Evidence:
- decision=IGNORE
- confidence=12.909375
--------------------------------

### Rule 15 — decision_eligibility

Name: Decision Eligibility
Stage: decision
Status: FAIL
Actual: NO
Threshold: signals≥4; completeness≥0.65; context pass; TR confirmed; no blocks
Unit: UNAVAILABLE
Source Module: services/v41/decisionEngine.ts (isEligibleForDirection)
Gates: LONG/SHORT eligibility
Data Source: pure_recall
Data Source Detail: isEligibleForDirection(readConfidenceDecisionContext(...), V41_DECISION_CONFIG)
Reason (VI): Không đủ eligibility — isEligibleForDirection(ctx, V41_DECISION_CONFIG)=false
Evidence:
- isEligibleForDirection=false
- trendReversalConfirmed=false
- marketContextPass=UNAVAILABLE
- marketContextDenied=false
- marketContextApplied=false
- completenessMultiplier=0.45
- minCompletenessMultiplier=0.65
- trendSignalCount=1
- requiredTrendSignalCount=4
- hardBlocks=TREND_REVERSAL_UNCONFIRMED
--------------------------------

### Rule 16 — visibility_show

Name: Visibility Show Gate
Stage: visibility
Status: PASS
Actual: YES
Threshold: prelim≥10 OR reversal≥60 OR exhaustion≥60
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: INACTIVE → WATCH_MODE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG show thresholds (no previousMode)
Reason (VI): Điều kiện HIỆN tại thời điểm scan — visibilityMode hiện tại=TRADE_MODE (chỉ CONDITION; previousMode không có trên row)
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=4
- trendExhaustion_4H_MI=10
- showBuySellThreshold=10
- showReversalThreshold=60
- showExhaustionThreshold=60
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
- note=Đánh giá CONDITION thuần từ snapshot tại thời điểm scan — không gọi resolveVisibilityHysteresis
--------------------------------

### Rule 17 — visibility_hide

Name: Visibility Hide Gate
Stage: visibility
Status: FAIL
Actual: NO
Threshold: prelim<8 AND reversal<50 AND exhaustion<50
Unit: UNAVAILABLE
Source Module: services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG
Gates: → INACTIVE
Data Source: condition_from_snapshot
Data Source Detail: CONDITION at scan time: calculatePreliminaryScores(row.snapshot) + DEFAULT_VISIBILITY_CONFIG hide thresholds (no previousMode)
Reason (VI): Chưa đạt điều kiện ẨN tại thời điểm scan (hoặc vùng hysteresis) — visibilityMode=TRADE_MODE
Evidence:
- evalKind=CONDITION_AT_SCAN_TIME
- buyScorePreliminary=3
- sellScorePreliminary=13
- reversalProbability=4
- trendExhaustion_4H_MI=10
- hideBuySellThreshold=8
- hideReversalThreshold=50
- hideExhaustionThreshold=50
- visibilityMode_row=TRADE_MODE
- previousMode=UNAVAILABLE_on_row
--------------------------------

### Rule 18 — early_warning_block

Name: Early Warning BLOCK
Stage: early_warning
Status: FAIL
Actual: WARNING_SOFT
Threshold: BLOCK
Unit: UNAVAILABLE
Source Module: services/v41/earlyWarningEngine.ts + store hysteresis
Gates: BLOCK → opportunityValid=false; visibilityMode=WATCH
Data Source: row_field
Data Source Detail: row.earlyWarning.severity (hysteresis-stabilized); evidence từ EarlyWarningSnapshot fields
Reason (VI): severity=WARNING_SOFT — không BLOCK
Evidence:
- severity=WARNING_SOFT
- rawSeverity=WARNING_SOFT
- signalCount=2
- volumeConfirmed=false
- signals30M=EMA20_SLOPE_UP_30M
- signals1H=BTC_REVERSAL_1H
- warningMessage=⚠️ 2 tín hiệu đảo chiều 30M+1H — thận trọng
- blockMessage=🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh
- rawBlockRule=totalSignals≥2 && volumeConfirmed → BLOCK (earlyWarningEngine)
--------------------------------

### Rule 19 — momentum_confirmed

Name: Momentum 1H Confirmed
Stage: momentum
Status: FAIL
Actual: LONG(0)/SHORT(0)
Threshold: 2
Unit: signals same side
Source Module: services/v41/momentumEngine1H.ts
Gates: opportunityValid / entry ready
Data Source: row_field
Data Source Detail: row.momentum.momentumConfirmedLong/Short
Reason (VI): Chưa confirmed — cần score ≥ 2 cùng phía
Evidence:
- momentumConfirmedLong=false
- momentumConfirmedShort=false
- momentumLong=0
- momentumShort=0
- signalsLong=
- signalsShort=
- source=row.momentum
--------------------------------

---

## RULE EVALUATION TABLE
| Rule ID | Name | Status | Actual | Threshold | Stage | Source Module |
| --- | --- | --- | --- | --- | --- | --- |
| cvd_flip | CVD Flip | FAIL | NO | BULL:(+,+,−)  /  BEAR:(−,−,+) — detectCvdFlip (không có ngưỡng magnitude) | trend_reversal | services/v41/reversalDetector.ts |
| volume_confirmation | Volume Confirmation | FAIL | 0.8118031600615432 | 1.2 | trend_reversal | services/v41/reversalDetector.ts |
| trend_exhaustion_gate | Trend Exhaustion Gate | FAIL | 0 | 55 | trend_reversal | services/v41/reversalDetector.ts |
| structure_break | Structure Break | PASS | LL_HL | lookback=50; BULL:HH→LH  /  BEAR:LL→HL | trend_reversal | services/v41/reversalDetector.ts |
| trend_reversal_confidence | Trend Reversal Confidence | WATCH | 17.5 | 70 | trend_reversal | services/v41/reversalDetector.ts |
| market_context_btc | Market Context — BTC | SKIPPED | NO | 75 | market_context | services/v41/marketContextFilter.ts |
| market_context_funding | Market Context — Funding | SKIPPED | YES | 0.0003 | market_context | services/v41/marketContextFilter.ts |
| market_context_oi | Market Context — OI | SKIPPED | skipped:true | 1.5/-1.5 | market_context | services/v41/marketContextFilter.ts |
| market_context_whale | Market Context — Whale | SKIPPED | skipped:true | whale.blocksReversal / signal enum | market_context | services/v41/marketContextFilter.ts |
| market_context_volatility | Market Context — Volatility | SKIPPED | NO | NORMAL pass; LOW/HIGH/EXTREME fail | market_context | services/v41/marketContextFilter.ts |
| decision_long_short | Decision LONG/SHORT Threshold | FAIL | 12.909375 | ≥ 75 | decision | services/v41/decision/decisionConfig.ts (thresholds.long/short) |
| decision_watch | Decision WATCH Threshold | FAIL | 12.909375 | 45 ≤ x < 75 | decision | services/v41/decision/decisionConfig.ts (thresholds.watch/long) |
| decision_ignore | Decision IGNORE Threshold | PASS | 12.909375 | < 45 (band IGNORE; config.ignore=25 = isIgnoreCase floor) | decision | services/v41/decision/decisionConfig.ts + decisionEngine ladder |
| decision_final_output | Decision Final Output (engine) | INFO | IGNORE | UNAVAILABLE | decision | services/v41/decisionEngine.ts (evaluateDecision → state) |
| decision_eligibility | Decision Eligibility | FAIL | NO | signals≥4; completeness≥0.65; context pass; TR confirmed; no blocks | decision | services/v41/decisionEngine.ts (isEligibleForDirection) |
| visibility_show | Visibility Show Gate | PASS | YES | prelim≥10 OR reversal≥60 OR exhaustion≥60 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| visibility_hide | Visibility Hide Gate | FAIL | NO | prelim<8 AND reversal<50 AND exhaustion<50 | visibility | services/v41/visibilityManager.ts + types.ts DEFAULT_VISIBILITY_CONFIG |
| early_warning_block | Early Warning BLOCK | FAIL | WARNING_SOFT | BLOCK | early_warning | services/v41/earlyWarningEngine.ts + store hysteresis |
| momentum_confirmed | Momentum 1H Confirmed | FAIL | LONG(0)/SHORT(0) | 2 | momentum | services/v41/momentumEngine1H.ts |

---

## RULE SUMMARY
Total Rules: 19
Passed: 3
Failed: 9
Watch: 1
Skipped: 5
Info: 1
Decision Output: IGNORE
Visibility Mode: TRADE_MODE
Trend Reversal State: WATCH
Market Context Applied: UNAVAILABLE
Decision Block Codes (V4.1): TREND_REVERSAL_UNCONFIRMED

---

## PIPELINE STAGE MAP

1. Market Intelligence (snapshot on row) → trendStrength / exhaustion / reversal / confidence / marketState
2. Visibility (show/hide conditions from snapshot) → visibilityMode on row
3. Trend Reversal Task-2 (1H) → cvd_flip / volume / exhaustion / structure_break / confidence → ACTIVE|WATCH
4. Market Context (5 dims, only applied when ACTIVE) → may downgrade to WATCH
5. Confidence Engine → final confidence + decisionContext
6. Decision Engine → LONG|SHORT|WATCH|IGNORE
7. Early Warning BLOCK + Momentum confirmed → entry gates (scan path)

Note: UI checklist "THIẾU GÌ" chỉ hiện 4 mục (cvd/volume/btc/exhaustion) — thiếu structure_break và đủ 5 market-context dims.

---

## DECISION CHAIN
MarketState=StrongDowntrend → Visibility=TRADE_MODE → TrendReversal=WATCH(signals=1/4) → MarketContext=NOT_APPLIED → Confidence=12.909375 → Decision=IGNORE → EarlyWarning=WARNING_SOFT → MomentumLong=false|Short=false

---

## AI REVIEW

Checklist trống — reviewer điền (không suy diễn từ V3/V4):

| Review Item | Result | Severity | Notes |
| --- | --- | --- | --- |
| Wrong threshold vs code? | □ | UNAVAILABLE | UNAVAILABLE |
| Missing Structure Break while ACTIVE? | □ | UNAVAILABLE | UNAVAILABLE |
| Market Context skipped mislabeled as PASS? | □ | UNAVAILABLE | UNAVAILABLE |
| Decision vs eligibility contradiction? | □ | UNAVAILABLE | UNAVAILABLE |
| Used 4H MI exhaustion for 1H TR gate? | □ | UNAVAILABLE | UNAVAILABLE |
| OI/Whale skipped but treated as confirmed? | □ | UNAVAILABLE | UNAVAILABLE |
| Visibility condition vs hysteresis outcome confused? | □ | UNAVAILABLE | UNAVAILABLE |
| Need Optimization? | □ | UNAVAILABLE | UNAVAILABLE |

---

## AI REVIEW SPECIFICATION (Rulebook V4.1 — EMBEDDED)

### REVIEW RULES
1. Mọi Actual/Threshold phải trùng field copy từ document hoặc từ module được nêu trong Source Module — không đoán.
2. Không map rule V4.1 → Group A/B/C hay HB-/GB- của V3/V4.
3. Status chỉ dùng PASS|FAIL|WATCH|SKIPPED|INFO — không HARD/SOFT/UNLOCK.
4. Checklist UI 4 mục không được hiểu là đủ điều kiện ACTIVE; phải kiểm tra thêm structure_break + conf≥70 + market context.
5. Nếu Evidence thiếu mà rule cần threshold số → classification INSUFFICIENT EVIDENCE, không bịa số.
6. Market State category là INFO/regime — reviewer không tự suy ngưỡng ts/ex/vol từ category (đã khóa ở MI Spec).
7. decision_eligibility phải gọi isEligibleForDirection đã export — không mirror logic riêng trong Builder.
8. OI/Whale trong production scan thường skipped (không có data trên row) — skipped ≠ business PASS; vẫn giữ trong Rulebook v1.
9. Visibility chỉ đánh giá CONDITION tại thời điểm scan (previousMode không có trên row).
10. decision_long_short / decision_watch / decision_ignore dùng Method A partition rời theo confidence (độc lập decision label). decision_final_output = INFO mô tả engine state.
11. LET matchedTier từ decision_final_output: LONG|SHORT→long_short; WATCH→watch; IGNORE→ignore. CRITICAL nếu (a) rule matchedTier ≠ PASS HOẶC (b) rule tier khác matchedTier = PASS.

### REVIEW LEVEL RESOLUTION (DETERMINISTIC)

Rulebook đọc Status/Actual đã freeze trong document — KHÔNG tự suy lại ngưỡng từ narrative.

Decision tier consistency (Method A):
- matchedTier = long_short nếu decision_final_output ∈ {LONG, SHORT}
- matchedTier = watch nếu decision_final_output = WATCH
- matchedTier = ignore nếu decision_final_output = IGNORE
- CRITICAL ⇔ (matchedTier rule status ≠ PASS) ∨ (∃ other tier rule with status = PASS)
- Ngược lại (khớp đúng 1 tier) → INFO

| Observation (from this document) | Suggested V41ReviewLevel | Notes |
| --- | --- | --- |
| matchedTier rule KHÔNG PASS (a) | CRITICAL | evaluateDecisionTierConsistency |
| Rule tier KHÁC matchedTier lại PASS (b) | CRITICAL | evaluateDecisionTierConsistency |
| matchedTier PASS và không tier khác PASS | INFO | Threshold bands khớp decision_final_output |
| Rule FAIL mà Decision Output = LONG hoặc SHORT | CRITICAL | Mâu thuẫn pipeline |
| structure_break FAIL trong khi Trend Reversal State = ACTIVE | CRITICAL | ACTIVE đòi hỏi đủ signal count (≥ TREND_REVERSAL_ACTIVE_MIN_SIGNALS) |
| Market Context dim FAIL nhưng Decision vẫn LONG/SHORT | WARN | Kiểm tra hard-block / eligibility |
| decision_eligibility Actual ≠ isEligibleForDirection cùng input | CRITICAL | Builder phải gọi hàm đã export, không tự tính |
| OI/Whale Status=SKIPPED bị diễn giải như confirmed PASS | WARN | skipped = no data on row, không chặn |
| Thiếu klines1H → nhiều rule SKIPPED khi audit action | BLOCK | Không đủ evidence |
| Mọi gate khớp Decision Output | INFO | Descriptive only |

### WORKED EXAMPLES

Example A — TR chưa đủ:
- Input: cvd_flip=FAIL, volume_confirmation=FAIL → trend_reversal_confidence WATCH
- Reviewer: Decision không được LONG/SHORT chỉ vì Confidence UI cao.

Example B — Context phủ định:
- Input: ≥ TREND_REVERSAL_ACTIVE_MIN_SIGNALS TR signals + conf≥70 nhưng market_context_btc FAIL → state downgrade WATCH
- Reviewer: WARN nếu Decision vẫn LONG/SHORT.

Example C — EW BLOCK:
- Input: early_warning_block Actual=BLOCK
- Reviewer: entry/opportunity phải bị chặn; Visibility có thể bị demote WATCH.

### REVIEW CLASSIFICATION
PASS | BUG | INSUFFICIENT EVIDENCE | ENHANCEMENT
