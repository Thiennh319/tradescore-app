# Metadata

Version: 1
Generated Time: 2026-07-20T05:05:54.363Z
Trade ID: BTCUSDT-LONG-v4
Coin: BTCUSDT
Side: LONG
Engine Version: 1.0.8
Score Version: v4

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: YES
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: RANGING
ADX1h: 24.135910034179688
ADX4h: 23.565845489501953
ATR1h: 283.1142883300781
CVD: -3261.076904296875
Change24h: -0.527
CvdTrend: UP
Decision: CHO_THEM
Direction: LONG
Entry Permission: NO
Entry State: SCORE_BLOCKED
Funding: 0.00489
Group Block Count: 0
Hard Block (Engine / All Sources): 0
Hard/Group Blocked State: NO
Price: 64398.9
RegimeConfidence: 0.65
Score: 8.65
Score Block Count: 0
TopLSRatio: 1.5253
Total Blocking Events: 0
Trend: BULLISH
Warning Count: 2

NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).

--------------------------------

# SCORE COMPONENTS

Component 001

Score ID: L1
Name: Giá & EMA (Slope)
Category: Layer 1
Weight: 1.5
Max Score: 1.5
Actual Score: 0.75
Display Layer Score: 0.75
Status: PASS
Actual: 0.75
Expected: 1.5
Reason: Đang pullback về EMA — vùng entry hợp lý
Recommendation: OK
Source Module: Layer 1
Evidence:
- Score=0.75

--------------------------------

Component 002

Score ID: L2
Name: RSI 14 + Divergence
Category: Layer 2
Weight: 1.5
Max Score: 1.5
Actual Score: 1.5
Display Layer Score: 1.5
Status: PASS
Actual: 1.5
Expected: 1.5
Reason: RSI 1H 48.6 & 4H 59.3 — vùng tối ưu 45-65
Recommendation: OK
Source Module: Layer 2
Evidence:
- Score=1.5

--------------------------------

Component 003

Score ID: L3
Name: MACD + Histogram Momentum
Category: Layer 3
Weight: 1.5
Max Score: 1.5
Actual Score: 1.5
Display Layer Score: 1.5
Status: PASS
Actual: 1.5
Expected: 1.5
Reason: Histogram dương cả 1H & 4H
Recommendation: OK
Source Module: Layer 3
Evidence:
- Score=1.5

--------------------------------

Component 004

Score ID: L4
Name: Bollinger %B + Bandwidth
Category: Layer 4
Weight: 1.5
Max Score: 1.5
Actual Score: 1.5
Display Layer Score: 1.5
Status: PASS
Actual: 1.5
Expected: 1.5
Reason: %B=43 Ranging vùng giữa — tốt nhất để buy
Recommendation: OK
Source Module: Layer 4
Evidence:
- Score=1.5

--------------------------------

Component 005

Score ID: L5
Name: L5a — CVD Strength
Category: Layer 5
Weight: 1.5
Max Score: 1.5
Actual Score: 0.75
Display Layer Score: 0.75
Status: PASS
Actual: 0.75
Expected: 1.5
Reason: CVD âm nhẹ (-3K) nhưng đang cải thiện
Recommendation: OK
Source Module: Layer 5
Evidence:
- Score=0.75

--------------------------------

Component 006

Score ID: L52
Name: L5b — Volume / OI
Category: Layer 52
Weight: 1.5
Max Score: 1.5
Actual Score: 0
Display Layer Score: 0
Status: WARNING
Actual: 0
Expected: 1.5
Reason: Không có tín hiệu Volume/OI rõ
Recommendation: Review Layer
Source Module: Layer 52
Evidence:
- Score=0

--------------------------------

Component 007

Score ID: L6
Name: Funding Rate + Trend
Category: Layer 6
Weight: 1.5
Max Score: 1.5
Actual Score: 0.75
Display Layer Score: 0.75
Status: PASS
Actual: 0.75
Expected: 1.5
Reason: Funding 0.0049% · ➡️ Thị trường cân bằng
Recommendation: OK
Source Module: Layer 6
Evidence:
- Score=0.75

--------------------------------

Component 008

Score ID: L7
Name: L/S Ratio + Whale Wall
Category: Layer 7
Weight: 1.5
Max Score: 1.5
Actual Score: 1.13
Display Layer Score: 1.13
Status: PASS
Actual: 1.13
Expected: 1.5
Reason: Đám đông giảm Long — contrarian thuận Long
Recommendation: OK
Source Module: Layer 7
Evidence:
- Score=1.13

--------------------------------

Component 009

Score ID: L8
Name: BTC 24h + 1H Momentum
Category: Layer 8
Weight: 1.5
Max Score: 1.5
Actual Score: 0
Display Layer Score: 0
Status: WARNING
Actual: 0
Expected: 1.5
Reason: BTC 24h -0.53%, 1h -0.51% — đỏ cả 2 khung
Recommendation: Review Layer
Source Module: Layer 8
Evidence:
- Score=0

--------------------------------

Component 010

Score ID: L9
Name: Phiên giao dịch
Category: Layer 9
Weight: 1.5
Max Score: 1.5
Actual Score: 0.75
Display Layer Score: 0.75
Status: PASS
Actual: 0.75
Expected: 1.5
Reason: London Lunch: 12-15h VN: London nghỉ trưa, thanh khoản giảm
Recommendation: OK
Source Module: Layer 9
Evidence:
- Score=0.75

--------------------------------

Component 011

Score ID: L10
Name: Tâm lý & Kỷ luật
Category: Layer 10
Weight: 1.5
Max Score: 1.5
Actual Score: 1.13
Display Layer Score: 1.13
Status: PASS
Actual: 1.13
Expected: 1.5
Reason: 4/5 mục — đạt
Recommendation: OK
Source Module: Layer 10
Evidence:
- Score=1.13

--------------------------------

# SCORE TABLE

Display Layer Scores are per-layer normalized values (max 1.5 each).
They do NOT sum to Decision Total / Final Score — see GROUP BREAKDOWN.

| Component | Max | Actual | Display Layer Score | Status |
| --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | 1.5 | 0.75 | 0.75 | PASS |
| RSI 14 + Divergence | 1.5 | 1.5 | 1.5 | PASS |
| MACD + Histogram Momentum | 1.5 | 1.5 | 1.5 | PASS |
| Bollinger %B + Bandwidth | 1.5 | 1.5 | 1.5 | PASS |
| L5a — CVD Strength | 1.5 | 0.75 | 0.75 | PASS |
| L5b — Volume / OI | 1.5 | 0 | 0 | WARNING |
| Funding Rate + Trend | 1.5 | 0.75 | 0.75 | PASS |
| L/S Ratio + Whale Wall | 1.5 | 1.13 | 1.13 | PASS |
| BTC 24h + 1H Momentum | 1.5 | 0 | 0 | WARNING |
| Phiên giao dịch | 1.5 | 0.75 | 0.75 | PASS |
| Tâm lý & Kỷ luật | 1.5 | 1.13 | 1.13 | PASS |

--------------------------------

# GROUP BREAKDOWN

Decision Total is copied from the frozen snap.score (Group scale; max 15).
Group Score columns are copied from engine groupScores on the snapshot.

| Group | Layers | Raw Sum* | Raw Max | Group Max | Group Score | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | L1–L4 | 7 | 8 | 5 | 4.38 | engine groupScores.A |
| B | L5a, L5b, L6, L7 | 3.51 | 8 | 5 | 2.19 | engine groupScores.B |
| C | L8–L10 | 2.51 | 6 | 5 | 2.08 | engine groupScores.C |

Decision Total (snap.score): 8.65

* Raw Sum is reconstructed from rounded Display Layer Scores. The frozen
  snapshot does not store engine rawLayerScores (snapshot limitation).
Group Score is copied from engine groupScores — it is NOT reverse-fitted
  from Decision Total (e.g. NOT Total − A − B).
Applying convertToGroupScoreV4 to reconstructed Raw Sum may differ from the
  copied Group Score by ≤0.03 due to display rounding. This is expected and
  does not indicate a scoring error.

--------------------------------

# SCORE TRACE INTERPRETATION

Read this section before comparing scores in this document.

Two independent scales:

1. Display Layer Score (SCORE COMPONENTS + SCORE TABLE)
   - Per-layer normalized value; max 1.5 each.
   - Copied verbatim from the engine layer result.
   - Hand-summing these values does NOT produce Decision Total or Final Score.

2. Decision Total (snap.score) (SCORE SUMMARY + SCORE TIMELINE + GROUP BREAKDOWN)
   - Group-scale total; max 15 (3 groups × max 5 each).
   - Copied from the frozen snapshot snap.score.
   - This is the authoritative score for decision bands.

GROUP BREAKDOWN:

- Group A (L1–L4), Group B (L5a, L5b, L6, L7), Group C (L8–L10).
- Group Score per group is copied from engine groupScores — not reverse-fitted.
- Decision Total = Group A + Group B + Group C (Group scale).
- Raw Sum* is reconstructed from rounded Display Layer Scores for reference only.

Common reviewer mistake (NOT a bug):

If hand-sum of Display Layer Scores (e.g. ~9.76) ≠ Decision Total (e.g. 8.65),
this reflects two different scales — not a scoring error. Verify GROUP BREAKDOWN.

Field labels in this document:

- Display Layer Score — per-layer display scale (max 1.5).
- Decision Total (snap.score) — frozen Group-scale total.
- Final Score — same as Decision Total in this export (bonus/penalty deltas are separate).

Entry State SCORE_BLOCKED reflects the decision band (KHONG_VAO / CHO_THEM / CHO_TAI_CHAM).
Score Block Count counts the soft blockReasons list size — independent of SCORE_BLOCKED.

--------------------------------

# BONUS

UNAVAILABLE

--------------------------------

# PENALTY

UNAVAILABLE

--------------------------------

# HARD / GROUP BLOCK

UNAVAILABLE

--------------------------------

# SCORE SUMMARY

Decision Total (snap.score): 8.65
  |
Bonus: UNAVAILABLE
  |
Penalty: UNAVAILABLE
  |
Override: UNAVAILABLE
  |
Hard/Group Blocked: NO
  |
Final Score: 8.65
  |
Grade: CHỜ THÊM
  |
Decision: CHO_THEM

--------------------------------

# DECISION POLICY

Decision: CHO_THEM
Decision Threshold: UNAVAILABLE
Decision Policy: UNAVAILABLE
Decision Source: UNAVAILABLE
Decision Rule: UNAVAILABLE
Decision Mapping: UNAVAILABLE
Decision Reason: UNAVAILABLE

Override: UNAVAILABLE
Override Rule: UNAVAILABLE
Override Module: UNAVAILABLE
Override Reason: UNAVAILABLE
Override Evidence:
- UNAVAILABLE

--------------------------------

# SCORE EXPLAINABILITY

Evidence is emitted once in SCORE COMPONENTS; this table cross-references
the explainability fields without duplicating evidence.

| Component | Actual | Expected | Reason | Recommendation | Source |
| --- | --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | 0.75 | 1.5 | Đang pullback về EMA — vùng entry hợp lý | OK | Layer 1 |
| RSI 14 + Divergence | 1.5 | 1.5 | RSI 1H 48.6 & 4H 59.3 — vùng tối ưu 45-65 | OK | Layer 2 |
| MACD + Histogram Momentum | 1.5 | 1.5 | Histogram dương cả 1H & 4H | OK | Layer 3 |
| Bollinger %B + Bandwidth | 1.5 | 1.5 | %B=43 Ranging vùng giữa — tốt nhất để buy | OK | Layer 4 |
| L5a — CVD Strength | 0.75 | 1.5 | CVD âm nhẹ (-3K) nhưng đang cải thiện | OK | Layer 5 |
| L5b — Volume / OI | 0 | 1.5 | Không có tín hiệu Volume/OI rõ | Review Layer | Layer 52 |
| Funding Rate + Trend | 0.75 | 1.5 | Funding 0.0049% · ➡️ Thị trường cân bằng | OK | Layer 6 |
| L/S Ratio + Whale Wall | 1.13 | 1.5 | Đám đông giảm Long — contrarian thuận Long | OK | Layer 7 |
| BTC 24h + 1H Momentum | 0 | 1.5 | BTC 24h -0.53%, 1h -0.51% — đỏ cả 2 khung | Review Layer | Layer 8 |
| Phiên giao dịch | 0.75 | 1.5 | London Lunch: 12-15h VN: London nghỉ trưa, thanh khoản giảm | OK | Layer 9 |
| Tâm lý & Kỷ luật | 1.13 | 1.5 | 4/5 mục — đạt | OK | Layer 10 |

--------------------------------

# SCORE DEPENDENCY

- Giá & EMA (Slope) depends Layer 1
- RSI 14 + Divergence depends Layer 2
- MACD + Histogram Momentum depends Layer 3
- Bollinger %B + Bandwidth depends Layer 4
- L5a — CVD Strength depends Layer 5
- L5b — Volume / OI depends Layer 52
- Funding Rate + Trend depends Layer 6
- L/S Ratio + Whale Wall depends Layer 7
- BTC 24h + 1H Momentum depends Layer 8
- Phiên giao dịch depends Layer 9
- Tâm lý & Kỷ luật depends Layer 10

--------------------------------

# SCORE TIMELINE

Input
  |
Rule Evaluation
  |
Decision Total (snap.score): 8.65
  |
Bonus: UNAVAILABLE
  |
Penalty: UNAVAILABLE
  |
Override: UNAVAILABLE
  |
Final Score: 8.65

--------------------------------

# CONFLICT DETECTION

Conflict: NO

--------------------------------

# AI REVIEW

SCORE REVIEW CHECKLIST

- Missing Component? YES / NO
- Wrong Weight? YES / NO
- Wrong Display Layer Score? YES / NO
- Threshold Too Strict? YES / NO
- Threshold Too Loose? YES / NO
- Duplicate Component? YES / NO
- Dead Component? YES / NO
- Bonus Conflict? YES / NO
- Penalty Conflict? YES / NO
- Override Correct? YES / NO
- HardBlocked Consistent? YES / NO
- Decision Mapping Correct? YES / NO
- Final Score Correct? YES / NO
- Need Optimization? YES / NO

Notes:
...

--------------------------------

# AI REVIEW SPECIFICATION

Review Protocol: v1 (LOCKED). See REVIEW_PROTOCOL.md.

This exported document is self-contained.

Reviewer AI MUST follow these rules. No external prompt is required.

--------------------------------

## SOURCE OF TRUTH

The exported snapshot is the ONLY source of truth.

Do NOT infer hidden engine behavior.

Do NOT reconstruct internal calculations.

Evaluate ONLY exported values.

--------------------------------

## EXPORT SCOPE

This document contains:

- Runtime snapshot values
- Rule relationships
- Decision results
- Structural evidence
- Documented formulas

This document intentionally may omit:

- Internal cache
- Temporary variables
- Engine private state
- Intermediate calculations

Missing exported fields MUST NOT be treated as implementation defects.

--------------------------------

## REVIEW RULES

Rule 1: Evaluate ONLY exported values.

Rule 2: Never infer hidden calculations.

Rule 3: If exported evidence is insufficient, classify as INSUFFICIENT EVIDENCE.

Rule 4: Missing diagnostic fields are ENHANCEMENT, NOT BUG.

Rule 5: A BUG requires exported evidence proving that the implementation violates the RuleBook.

Rule 6: Do NOT report a bug using assumptions.

Rule 7: Block Type MUST be derived only via BLOCK TYPE RESOLUTION table above (Hard list / Score list membership). Any Block Type not traceable to list membership is a candidate BUG, regardless of Mandatory or Status.

Reviewer AI MUST:

- Evaluate only exported values.
- Treat the exported snapshot as the only source of truth.
- Respect documented formulas.
- Respect documented transformations.
- Respect the documented Gate hierarchy.

Reviewer AI MUST NOT:

- Infer hidden calculations.
- Reconstruct engine internals.
- Guess missing snapshot values.
- Assume undocumented Rule behavior.
- Report bugs using assumptions.

--------------------------------

## SCORING INTERPRETATION

Displayed Scores are normalized values.

Display Layer Score (Score Trace / Rule Trace): per-layer display scale (max 1.5 each).
Do NOT hand-sum Display Layer Scores and compare to Decision Total — they use different scales.

Decision Total (snap.score): Group-scale total (max 15). Copied from the frozen snapshot.
This is the authoritative score for decision bands.

GROUP BREAKDOWN: Group A + Group B + Group C = Decision Total.
Group Scores are copied from engine groupScores — not reverse-fitted from the total.

Hand-sum of Display Layer Scores ≠ Decision Total is expected (two scales) — NOT a bug
unless GROUP BREAKDOWN contradicts Decision Total.

Bonus values are applied to Internal Raw Scores.

Displayed Scores MUST NOT be compared directly against Raw Bonus values.

Reviewer AI must evaluate the documented transformation before reporting inconsistencies.

--------------------------------

## BLOCK INTERPRETATION

Hard Blocks may originate from:

- RuleBook
- Independent Gates
- Pre-Filters

Hard Blocks are NOT Score penalties.

Gate ≠ RuleBook Rule.

--------------------------------

## BLOCK TYPE RESOLUTION (DETERMINISTIC — DO NOT INFER)

Block Type of a rule/layer is determined ONLY by list membership below.
It is NEVER inferred from Status, Mandatory, or Actual vs Expected.

| Rule/Layer name appears in... | Block Type |
|---|---|
| "Hard Blocks (Engine / All Sources)" list in BLOCKING EVENTS ORIGIN | HARD |
| "Score Blocks (block reasons)" list in BLOCKING EVENTS ORIGIN, AND not in Hard list above | SOFT |
| Neither list | NONE |

FORBIDDEN INFERENCE (explicitly disallowed — this caused a real bug, fixed 2026-07-22):
- Mandatory = YES does NOT imply Block Type = HARD.
- Status = FAIL does NOT imply Block Type = HARD.
- Actual < Expected does NOT imply Block Type = HARD.
Mandatory, Status, and Block Type are THREE INDEPENDENT fields. A rule can be
Mandatory=YES + Status=FAIL + Block Type=SOFT simultaneously — this is valid
and expected, not a contradiction.

## Worked examples (canonical reference — use these to self-check before reporting a bug)

| Trade | Rule | Status | Mandatory | Actual vs Expected | In Hard list? | In Score list? | Correct Block Type |
|---|---|---|---|---|---|---|---|
| BTCUSDT-SHORT | L5a | FAIL | YES | 0 < 1.5 | NO | YES | SOFT |
| SOLUSDT-SHORT | L5a | PASS | YES | 0.38 < 1.5 | NO | YES | SOFT |
| NEARUSDT-SHORT | L5a | PASS | YES | 1.5 = 1.5 | NO | NO | NONE |
| (hypothetical) any-SHORT | L5a | FAIL | YES | CVD extreme | YES | — | HARD |
| NEARUSDT-SHORT | L3 | PASS | NO | L3 raw 1.0 (≥1 shared, <1.5 NEAR gate) | YES (NEAR SHORT — L3 MACD < 1.5…) | NO | HARD |

NEAR-only S1 note: hard reason string starts with "NEAR SHORT — L3 MACD…"
(not "^L3"). Rule Trace still maps it to L3 Block Type=HARD via list membership
+ layer matcher. S1 does NOT flip L3 passed→false; Warning Count stays soft-fail-only
(same pattern as other hard gates — not the old warningLayerCountFromSnap bug class).

Reviewer AI MUST cross-check the two lists in BLOCKING EVENTS ORIGIN before
assigning any Block Type verdict. If a rule's Block Type in the export does
NOT match this table's derivation from the two lists, classify as BUG with
exact list membership as evidence — not as INSUFFICIENT EVIDENCE or ENHANCEMENT.

--------------------------------

## SNAPSHOT CAPABILITY

This export represents the frozen runtime snapshot.

If a value is marked UNAVAILABLE, it means:

"Not stored in this snapshot version."

It does NOT imply:

- Calculation failure
- Engine defect
- Export bug

Reviewer AI MUST classify missing snapshot capability as ENHANCEMENT unless exported evidence proves otherwise.

--------------------------------

## REVIEW CLASSIFICATION

Every finding MUST belong to exactly one category:

- PASS — Implementation is consistent with exported evidence.
- BUG — Exported evidence proves a RuleBook violation. A BUG must always reference exported evidence. No assumptions allowed.
- INSUFFICIENT EVIDENCE — The exported snapshot does not contain enough information to verify the finding. Reviewer must stop speculation.
- ENHANCEMENT — The implementation is correct; additional exported information could improve future review quality. Enhancement is NOT a bug.

No other verdict is allowed.

--------------------------------

## REVIEW ORDER

1. Verify snapshot completeness.
2. Verify Rule consistency.
3. Verify structural consistency.
4. Verify Decision consistency.
5. Verify exported Evidence.
6. Suggest Enhancements.

Reviewer MUST NOT skip steps.

--------------------------------

# SCORE NORMALIZATION

Every layer is scored internally on a raw scale, then normalized for display.

Internal Layer Max (raw scale): 2
Display Layer Max (normalized scale): 1.5

Display Formula (documentation — values below are copied, not recomputed):

display = round((raw / 2) x 1.5, 2)

| Layer | Raw Score (internal) | Display Score | Display Max | Result |
| --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | UNAVAILABLE | 0.75 | 1.5 | PASS |
| RSI 14 + Divergence | UNAVAILABLE | 1.5 | 1.5 | PASS |
| MACD + Histogram Momentum | UNAVAILABLE | 1.5 | 1.5 | PASS |
| Bollinger %B + Bandwidth | UNAVAILABLE | 1.5 | 1.5 | PASS |
| L5a — CVD Strength | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L5b — Volume / OI | UNAVAILABLE | 0 | 1.5 | WARNING |
| Funding Rate + Trend | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L/S Ratio + Whale Wall | UNAVAILABLE | 1.13 | 1.5 | PASS |
| BTC 24h + 1H Momentum | UNAVAILABLE | 0 | 1.5 | WARNING |
| Phiên giao dịch | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Tâm lý & Kỷ luật | UNAVAILABLE | 1.13 | 1.5 | PASS |

VWAP Bonus Trace (copied from frozen snapshot, active direction):

Bonus Applied: UNAVAILABLE
Bonus Raw (internal scale): UNAVAILABLE
Bonus Reason: UNAVAILABLE

NOTES

- Raw Score is the internal engine score (raw scale, max 2 per layer).
- Display Score is the normalized value shown in this document (max 1.5 per layer).
- Bonus is always applied to the RAW score BEFORE normalization.
- Bonus Raw MUST NOT be compared directly with Display Scores. A raw bonus of +0.5 appears as +0.375 on the display scale.
- When the Bonus Reason contains "bonus L5 +", the bonus WAS applied and is already included in the L5 score shown above.
- Raw Score shows UNAVAILABLE because the frozen snapshot stores display values only. This is a snapshot limitation, not a defect.

--------------------------------

# BLOCKING EVENTS ORIGIN

Every blocking event (Hard, Group, Score/soft, and ADX Gate) is listed here
with its Source and Owner — not only hard blocks.

No blocking events recorded in this frozen snapshot.

When present, every blocking event lists WHERE it came from (Source),
WHO owns the rule (Owner), and WHY it fired (Reason) — copied verbatim.

--------------------------------

# BLOCKING SUMMARY

Hard Blocks (Engine / All Sources): 0
Group Blocks: 0
Score Blocks (block reasons): 0
Total Blocking Events: 0

Total Blocking Events is an exported structural summary: the size of the
engine's merged block list (hard blocks + score blocks + group blocks).
It is NOT the number of failed mandatory rules.
Hard Blocks (Engine / All Sources) counts the per-side engine hard-block list,
which differs from Hard Block (Rule Trace Scope) in RULE SUMMARY.
See BLOCKING EVENTS ORIGIN above for detail on every entry (hard, group, score, gate).

--------------------------------

# PRE-FILTERS

Pre-filters run BEFORE / OUTSIDE RuleBook scoring. A Gate is NOT a Rule:
it never contributes points and never appears in the scoring layers.

ADX Gate

Type: Independent Market Filter
Purpose: Detect choppy market (no tradable trend)
Inputs: ADX 1H, ADX 4H
Block Condition (documentation): ADX1H < 15 AND ADX4H < 15
Current ADX 1H: 24.135910034179688
Current ADX 4H: 23.565845489501953
Market Regime: RANGING
Gate Result: ALLOWED
Gate Fired: UNAVAILABLE
Gate Message: UNAVAILABLE
Scope: Pre-RuleBook — not part of Rule scoring

--------------------------------

# TRACE INTERPRETATION

This document contains:

- Internal Engine values
- Normalized Display values
- Structural Rule relationships
- Runtime snapshot values

Important Notes

1. Score pipeline: Raw Scores -> Bonus -> Clamp -> Normalization -> Display Score.
2. Displayed scores are normalized values. They are NOT raw engine scores.
3. Bonus values are applied to Raw Scores. They are NOT directly added to Display Scores.
4. Hard Blocks originate from independent Gates or RuleBook filters. They are not necessarily Score penalties.
5. Reviewer AI MUST evaluate the documented transformations before reporting inconsistencies.
6. If a value appears inconsistent, verify Raw -> Transformation -> Display before concluding that a bug exists.
7. A Gate (see PRE-FILTERS) is NOT a Rule: it blocks entry but never scores points.
8. Missing snapshot values always render UNAVAILABLE — they are never inferred.
9. Display Layer Scores use a per-layer normalize scale (max 1.5 each). Decision Total uses the Group scale (3 groups, each max 5, total max 15). The two scales are independent and must not be added together.
10. Entry State SCORE_BLOCKED reflects the decision band (KHONG_VAO / CHO_THEM / CHO_TAI_CHAM). It is independent of Score Block Count (size of the soft blockReasons list) — not a missing counter.
