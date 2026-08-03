# Metadata

Version: 1
Generated Time: 2026-08-02T16:34:48.932Z
Trade ID: BNBUSDT-LONG-v4
Rule Version: v4
Engine Version: 1.0.8
Coin: BNBUSDT
Side: LONG

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: YES
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: RANGING
ADX1h: 19.521120071411133
ADX4h: 18.648263931274414
ATR1h: 2.3781442642211914
CVD: -11414.703125
Change24h: 1.715
CvdTrend: DOWN
Decision: KHONG_VAO
Direction: LONG
Entry Permission: NO
Entry State: HARD_BLOCKED
Funding: 0.00851
Group Block Count: 0
Hard Block (Engine / All Sources): 1
Hard/Group Blocked State: YES
Price: 588.44
RegimeConfidence: 0.65
Score: 8.13
Score Block Count: 1
TopLSRatio: 2.7341
Total Blocking Events: 2
Trend: BULLISH
Warning Count: 1

NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).

--------------------------------

# RULE TRACE

Rule 001

Giá & EMA (Slope)

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.13
Reason: Giá trên EMA nhưng slope phẳng
Recommendation: OK
Source Module: Layer 1
Evidence:
- Score=1.13

--------------------------------

Rule 002

RSI 14 + Divergence

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.5
Reason: RSI 1H 62.1 & 4H 55.7 — vùng tối ưu 45-65
Recommendation: OK
Source Module: Layer 2
Evidence:
- Score=1.5

--------------------------------

Rule 003

MACD + Histogram Momentum

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.13
Reason: 1H dương & đang bẻ góc lên
Recommendation: OK
Source Module: Layer 3
Evidence:
- Score=1.13

--------------------------------

Rule 004

Bollinger %B + Bandwidth

Status: WARNING
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0
Reason: %B=82 Không thuận Long Ranging
Recommendation: Review Layer
Source Module: Layer 4
Evidence:
- Score=0

--------------------------------

Rule 005

L5a — CVD Strength

Status: FAIL
Weight: 1.5
Priority: 100
Block Type: SOFT
Mandatory: YES
Expected: 1.5
Actual: 0
Reason: CVD -11K — chưa đủ tín hiệu Long
Recommendation: Review Layer
Source Module: Layer 5
Evidence:
- Score=0

--------------------------------

Rule 006

L5b — Volume / OI

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.5
Reason: Vol 1.5×, OI tăng+giá tăng
Recommendation: OK
Source Module: Layer 52
Evidence:
- Score=1.5

--------------------------------

Rule 007

Funding Rate + Trend

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0.38
Reason: Funding 0.0085% · 📊 Funding dương vừa phải
Recommendation: OK
Source Module: Layer 6
Evidence:
- Score=0.38

--------------------------------

Rule 008

L/S Ratio + Whale Wall

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.13
Reason: Đám đông giảm Long — contrarian thuận Long
Recommendation: OK
Source Module: Layer 7
Evidence:
- Score=1.13

--------------------------------

Rule 009

BTC 24h + 1H Momentum

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.13
Reason: BTC 24h 0.36%, 1h 0.00% — 24h xanh, 1h flat
Recommendation: OK
Source Module: Layer 8
Evidence:
- Score=1.13

--------------------------------

Rule 010

Phiên giao dịch

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0.75
Reason: NY Close: 23:30-02h VN: NY đóng cửa, giảm dần
Recommendation: OK
Source Module: Layer 9
Evidence:
- Score=0.75

--------------------------------

Rule 011

Tâm lý & Kỷ luật

Status: PASS
Weight: 1.5
Priority: 50
Block Type: HARD
Mandatory: NO
Expected: 1.5
Actual: 0.38
Reason: 2/5 mục — chưa đủ, tâm lý chưa sẵn sàng
Recommendation: OK
Source Module: Layer 10
Evidence:
- Score=0.38


--------------------------------

# RULE EVALUATION TABLE

| Rule | PASS | FAIL | Weight | Priority |
| --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | YES | - | 1.5 | 50 |
| RSI 14 + Divergence | YES | - | 1.5 | 50 |
| MACD + Histogram Momentum | YES | - | 1.5 | 50 |
| Bollinger %B + Bandwidth | - | - | 1.5 | 50 |
| L5a — CVD Strength | - | YES | 1.5 | 100 |
| L5b — Volume / OI | YES | - | 1.5 | 50 |
| Funding Rate + Trend | YES | - | 1.5 | 50 |
| L/S Ratio + Whale Wall | YES | - | 1.5 | 50 |
| BTC 24h + 1H Momentum | YES | - | 1.5 | 50 |
| Phiên giao dịch | YES | - | 1.5 | 50 |
| Tâm lý & Kỷ luật | YES | - | 1.5 | 50 |

--------------------------------

# RULE SUMMARY

Matched Rules: 9
Failed Rules: 1
Ignored Rules: 0
Blocked Rules: 1
Soft Block: 1
Hard Block (Rule Trace Scope): 1
Unlock Rules: 0

--------------------------------

# PRIORITY TREE

Priority (high wins over low):

100
  L5a — CVD Strength [FAIL]
50
  Giá & EMA (Slope) [PASS]
50
  RSI 14 + Divergence [PASS]
50
  MACD + Histogram Momentum [PASS]
50
  Bollinger %B + Bandwidth [WARNING]
50
  L5b — Volume / OI [PASS]
50
  Funding Rate + Trend [PASS]
50
  L/S Ratio + Whale Wall [PASS]
50
  BTC 24h + 1H Momentum [PASS]
50
  Phiên giao dịch [PASS]
50
  Tâm lý & Kỷ luật [PASS]

--------------------------------

# DISPLAY LAYER SCORES

Display Layer Scores are per-layer normalized values for reference.
They do NOT sum directly to the Decision Total — see Group Breakdown below.

Giá & EMA (Slope): +1.13
RSI 14 + Divergence: +1.5
MACD + Histogram Momentum: +1.13
Bollinger %B + Bandwidth: 0
L5a — CVD Strength: 0
L5b — Volume / OI: +1.5
Funding Rate + Trend: +0.38
L/S Ratio + Whale Wall: +1.13
BTC 24h + 1H Momentum: +1.13
Phiên giao dịch: +0.75
Tâm lý & Kỷ luật: +0.38

--------------------------------

# GROUP BREAKDOWN

Decision Total is copied from the frozen snap.score (Group scale; max 15).
Group Score columns are copied from engine groupScores on the snapshot.

| Group | Layers | Raw Sum* | Raw Max | Group Max | Group Score | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | L1–L4 | 5.02 | 8 | 5 | 3.13 | engine groupScores.A |
| B | L5a, L5b, L6, L7 | 4.02 | 8 | 5 | 2.5 | engine groupScores.B |
| C | L8–L10 | 3.02 | 6 | 5 | 2.5 | engine groupScores.C |

Decision Total (snap.score): 8.13

* Raw Sum is reconstructed from rounded Display Layer Scores. The frozen
  snapshot does not store engine rawLayerScores (snapshot limitation).
Group Score is copied from engine groupScores — it is NOT reverse-fitted
  from Decision Total (e.g. NOT Total − A − B).
Applying convertToGroupScoreV4 to reconstructed Raw Sum may differ from the
  copied Group Score by ≤0.03 due to display rounding. This is expected and
  does not indicate a scoring error.

--------------------------------

# RULE DEPENDENCY

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

# CONFLICT DETECTION

Conflict: NO

--------------------------------

# DECISION CHAIN

Input: BNBUSDT LONG
  |
Matched Rules: 9
  |
Score: 8.13
  |
Hard Block: YES
  |
Decision: KHONG_VAO
  |
Recommendation: KHÔNG VÀO

--------------------------------

# AI REVIEW

AI REVIEW CHECKLIST

- Rule Conflict? YES / NO
- Priority Conflict? YES / NO
- Missing Rule? YES / NO
- Dead Rule? YES / NO
- Duplicate Rule? YES / NO
- Threshold Issue? YES / NO
- Weight Issue? YES / NO
- Evidence Missing? YES / NO
- Decision Correct? YES / NO
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
| Giá & EMA (Slope) | UNAVAILABLE | 1.13 | 1.5 | PASS |
| RSI 14 + Divergence | UNAVAILABLE | 1.5 | 1.5 | PASS |
| MACD + Histogram Momentum | UNAVAILABLE | 1.13 | 1.5 | PASS |
| Bollinger %B + Bandwidth | UNAVAILABLE | 0 | 1.5 | WARNING |
| L5a — CVD Strength | UNAVAILABLE | 0 | 1.5 | FAIL |
| L5b — Volume / OI | UNAVAILABLE | 1.5 | 1.5 | PASS |
| Funding Rate + Trend | UNAVAILABLE | 0.38 | 1.5 | PASS |
| L/S Ratio + Whale Wall | UNAVAILABLE | 1.13 | 1.5 | PASS |
| BTC 24h + 1H Momentum | UNAVAILABLE | 1.13 | 1.5 | PASS |
| Phiên giao dịch | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Tâm lý & Kỷ luật | UNAVAILABLE | 0.38 | 1.5 | PASS |

VWAP Bonus Trace (copied from frozen snapshot, active direction):

Bonus Applied: NO
Bonus Raw (internal scale): 0
Bonus Reason: Giá chưa gần VWAP

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

Every blocking event below is copied verbatim from the frozen snapshot.
Source identifies the exact engine list the entry was copied from.

| Blocking Event | Source | Owner | Layer / Scope | Reason |
| --- | --- | --- | --- | --- |
| L10 Tâm lý chưa sẵn sàng | Score Engine hard block list (per-side) | RuleBook Hard Block rules | Scoring layer / market filter | L10 Tâm lý chưa sẵn sàng |
| L5a CVD chưa đủ 1đ — CVD -11K — chưa đủ tín hiệu Long | Score Block list (blockReasons) | RuleBook Score Block rules (soft, not hard) | Layer score below required minimum | L5a CVD chưa đủ 1đ — CVD -11K — chưa đủ tín hiệu Long |

Condition / Current Value pairs: UNAVAILABLE
(The frozen snapshot stores block reason strings only; numeric
condition/current pairs are not part of the snapshot.)

--------------------------------

# BLOCKING SUMMARY

Hard Blocks (Engine / All Sources): 1
Group Blocks: 0
Score Blocks (block reasons): 1
Total Blocking Events: 2

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
Current ADX 1H: 19.521120071411133
Current ADX 4H: 18.648263931274414
Market Regime: RANGING
Gate Result: ALLOWED
Gate Fired: NO
Gate Message: ⚠️ Thị trường RANGING — TP thu hẹp
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
