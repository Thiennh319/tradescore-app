# Metadata

Version: 1
Trade ID: NEARUSDT-SHORT-v4
Coin: NEARUSDT
Side: SHORT
Timestamp: 2026-08-02T12:00:00.000Z
Rule Version: UNAVAILABLE
Entry Version: v4
Score Version: UNAVAILABLE
Engine Version: 1.0.8

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: UNAVAILABLE
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: UNAVAILABLE
ADX1h: UNAVAILABLE
ADX4h: UNAVAILABLE
ATR1h: UNAVAILABLE
CVD: UNAVAILABLE
Change24h: -1.2
CvdTrend: UNAVAILABLE
Decision: KHONG_VAO
Direction: SHORT
Entry Permission: NO
Entry State: UNAVAILABLE
Funding: UNAVAILABLE
Group Block Count: 0
Hard Block (Engine / All Sources): 1
Hard/Group Blocked State: YES
Price: 2.45
RegimeConfidence: 0.7
Score: 6
Score Block Count: 0
TopLSRatio: UNAVAILABLE
Total Blocking Events: 1
Trend: BEARISH
Warning Count: 0

NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).

--------------------------------

# ENTRY DECISION

Decision: WAIT
Initial Decision: UNAVAILABLE
Override: UNAVAILABLE
Final Decision: WAIT
Reason: Không vào
Summary: Không vào
Confidence: 50%
Grade: Không vào

--------------------------------

# DECISION TREE

UNAVAILABLE

--------------------------------

# CHECKLIST

Check 001

Check ID: L1
Check Name: Giá & EMA (Slope)
Rule ID: L1
Rule Name: Giá & EMA (Slope)
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 1
Evidence:
- Score=1

--------------------------------

Check 002

Check ID: L2
Check Name: RSI 14 + Divergence
Rule ID: L2
Rule Name: RSI 14 + Divergence
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 2
Evidence:
- Score=0.75

--------------------------------

Check 003

Check ID: L3
Check Name: MACD + Histogram Momentum
Rule ID: L3
Rule Name: MACD + Histogram Momentum
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: Histogram âm 1H / dương 4H — raw ~1.0
Recommendation: UNAVAILABLE
Source: Layer 3
Evidence:
- Score=0.75

--------------------------------

Check 004

Check ID: L4
Check Name: Bollinger %B + Bandwidth
Rule ID: L4
Rule Name: Bollinger %B + Bandwidth
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 4
Evidence:
- Score=0.75

--------------------------------

Check 005

Check ID: L5
Check Name: L5a — CVD Strength
Rule ID: L5
Rule Name: L5a — CVD Strength
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 5
Evidence:
- Score=1

--------------------------------

Check 006

Check ID: L52
Check Name: L5b — Volume / OI
Rule ID: L52
Rule Name: L5b — Volume / OI
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 52
Evidence:
- Score=0.75

--------------------------------

Check 007

Check ID: L6
Check Name: Funding Rate + Trend
Rule ID: L6
Rule Name: Funding Rate + Trend
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 6
Evidence:
- Score=0.75

--------------------------------

Check 008

Check ID: L7
Check Name: L/S Ratio + Whale Wall
Rule ID: L7
Rule Name: L/S Ratio + Whale Wall
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 7
Evidence:
- Score=0.75

--------------------------------

Check 009

Check ID: L8
Check Name: BTC 24h + 1H Momentum
Rule ID: L8
Rule Name: BTC 24h + 1H Momentum
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 8
Evidence:
- Score=0.75

--------------------------------

Check 010

Check ID: L9
Check Name: Phiên giao dịch
Rule ID: L9
Rule Name: Phiên giao dịch
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 9
Evidence:
- Score=0.75

--------------------------------

Check 011

Check ID: L10
Check Name: Tâm lý & Kỷ luật
Rule ID: L10
Rule Name: Tâm lý & Kỷ luật
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: ok
Recommendation: UNAVAILABLE
Source: Layer 10
Evidence:
- Score=0.75

--------------------------------

# BLOCKERS

Hard Block: 1
Group Block: 0
Soft Block: 0
Unlock: 0

Blocker 001
Type: HARD
Trigger: UNAVAILABLE
Override: UNAVAILABLE
Rule: NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)
Reason: NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)
Priority: UNAVAILABLE
Evidence:
- Hard Block=NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only)

--------------------------------

# ENTRY EVIDENCE

One evidence set per check — emitted once in CHECKLIST, cross-referenced here.

| Check | Rule ID | Actual | Expected | Threshold | Difference | Priority | Unit | Reason | Recommendation | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | L1 | 1 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 1 |
| RSI 14 + Divergence | L2 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 2 |
| MACD + Histogram Momentum | L3 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Histogram âm 1H / dương 4H — raw ~1.0 | UNAVAILABLE | Layer 3 |
| Bollinger %B + Bandwidth | L4 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 4 |
| L5a — CVD Strength | L5 | 1 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 5 |
| L5b — Volume / OI | L52 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 52 |
| Funding Rate + Trend | L6 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 6 |
| L/S Ratio + Whale Wall | L7 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 7 |
| BTC 24h + 1H Momentum | L8 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 8 |
| Phiên giao dịch | L9 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 9 |
| Tâm lý & Kỷ luật | L10 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | ok | UNAVAILABLE | Layer 10 |

--------------------------------

# ENTRY CONTRIBUTION

Contributions are copied from the engine — never summed here.

Giá & EMA (Slope): 1
RSI 14 + Divergence: 0.75
MACD + Histogram Momentum: 0.75
Bollinger %B + Bandwidth: 0.75
L5a — CVD Strength: 1
L5b — Volume / OI: 0.75
Funding Rate + Trend: 0.75
L/S Ratio + Whale Wall: 0.75
BTC 24h + 1H Momentum: 0.75
Phiên giao dịch: 0.75
Tâm lý & Kỷ luật: 0.75

--------------------------------

# RULEBOOK INTERACTION

State Before: UNAVAILABLE
  |
State After: UNAVAILABLE

Trigger Rule: UNAVAILABLE
Reason: UNAVAILABLE

--------------------------------

# DECISION CHAIN

Market Snapshot: PROVIDED
  |
Rule Trace: SEE 01_RULEBOOK.md
  |
Score Trace: SEE 02_SCORE_ENGINE.md
  |
Checklist: 11
  |
Blockers: 1
  |
RuleBook State: BLOCKED
  |
Entry Decision: WAIT
  |
Recommendation: KHONG_VAO

--------------------------------

# ENTRY DEPENDENCY

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

# ENTRY SUMMARY

Passed Checks: 11
Warnings: 0
Failed Checks: 0
Hard Blocks: 1
Group Blocks: 0
Soft Blocks: 0
Unlock Rules: 0
Decision: WAIT
Confidence: 50%
Grade: Không vào
RuleBook State: BLOCKED

--------------------------------

# AI REVIEW

AI REVIEW CHECKLIST

| Review Item | Result | Notes |
| --- | --- | --- |
| Missing Check | □ | Missing Check? YES / NO |
| Wrong Threshold | □ | Threshold Too Strict? YES / NO; Threshold Too Loose? YES / NO |
| Wrong Decision | □ | Wrong Decision? YES / NO |
| Wrong Blocker | □ | Wrong Blocker? YES / NO |
| Missing Evidence | □ | Missing Evidence? YES / NO |
| Duplicate Evidence | □ | Duplicate Evidence? YES / NO |
| RuleBook Error | □ | Wrong RuleBook State? YES / NO |
| Score Conflict | □ | Conflict? YES / NO |
| Entry Conflict | □ | Conflict? YES / NO |
| Need Optimization | □ | Need Optimization? YES / NO |

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
| Giá & EMA (Slope) | UNAVAILABLE | 1 | 1.5 | PASS |
| RSI 14 + Divergence | UNAVAILABLE | 0.75 | 1.5 | PASS |
| MACD + Histogram Momentum | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Bollinger %B + Bandwidth | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L5a — CVD Strength | UNAVAILABLE | 1 | 1.5 | PASS |
| L5b — Volume / OI | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Funding Rate + Trend | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L/S Ratio + Whale Wall | UNAVAILABLE | 0.75 | 1.5 | PASS |
| BTC 24h + 1H Momentum | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Phiên giao dịch | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Tâm lý & Kỷ luật | UNAVAILABLE | 0.75 | 1.5 | PASS |

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

Every blocking event below is copied verbatim from the frozen snapshot.
Source identifies the exact engine list the entry was copied from.

| Blocking Event | Source | Owner | Layer / Scope | Reason |
| --- | --- | --- | --- | --- |
| NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only) | Score Engine hard block list (per-side) | RuleBook Hard Block rules | Scoring layer / market filter | NEAR SHORT — L3 MACD < 1.5 (gate NEAR-only) |

Condition / Current Value pairs: UNAVAILABLE
(The frozen snapshot stores block reason strings only; numeric
condition/current pairs are not part of the snapshot.)

--------------------------------

# BLOCKING SUMMARY

Hard Blocks (Engine / All Sources): 1
Group Blocks: 0
Score Blocks (block reasons): 0
Total Blocking Events: 1

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
Current ADX 1H: UNAVAILABLE
Current ADX 4H: UNAVAILABLE
Market Regime: UNAVAILABLE
Gate Result: UNAVAILABLE
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
