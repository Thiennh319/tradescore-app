# Metadata

Version: 1
Trade ID: BTCUSDT-LONG-v4
Coin: BTCUSDT
Side: LONG
Timestamp: 2026-07-21T01:41:56.458Z
Rule Version: UNAVAILABLE
Entry Version: v4
Score Version: UNAVAILABLE
Engine Version: 1.0.7

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: YES
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: RANGING
ADX1h: 26.113727569580078
ADX4h: 23.018468856811523
ATR1h: 382.71038818359375
CVD: 6742.53173828125
Change24h: 0.744
CvdTrend: UP
Decision: VAO_TU_TIN
Direction: LONG
Entry Permission: YES
Entry State: ENTRY_VALID
Funding: 0.0054
Group Block Count: 0
Hard Block (Engine / All Sources): 0
Hard/Group Blocked State: NO
Price: 65345.1
RegimeConfidence: 0.65
Score: 11.15
Score Block Count: 0
TopLSRatio: 1.3337
Total Blocking Events: 0
Trend: BULLISH
Warning Count: 0

NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).

--------------------------------

# ENTRY DECISION

Decision: ENTER
Initial Decision: UNAVAILABLE
Override: UNAVAILABLE
Final Decision: ENTER
Reason: VÀO TỰ TIN
Summary: VÀO TỰ TIN
Confidence: ~70-75%
Grade: VÀO TỰ TIN

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
Actual: 1.5
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: LONG alignment
Recommendation: UNAVAILABLE
Source: Layer 1
Evidence:
- Score=1.5

--------------------------------

Check 002

Check ID: L2
Check Name: RSI 14 + Divergence
Rule ID: L2
Rule Name: RSI 14 + Divergence
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1.5
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: RSI optimal
Recommendation: UNAVAILABLE
Source: Layer 2
Evidence:
- Score=1.5

--------------------------------

Check 003

Check ID: L3
Check Name: MACD + Histogram Momentum
Rule ID: L3
Rule Name: MACD + Histogram Momentum
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1.5
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: Histogram dương
Recommendation: UNAVAILABLE
Source: Layer 3
Evidence:
- Score=1.5

--------------------------------

Check 004

Check ID: L4
Check Name: Bollinger %B + Bandwidth
Rule ID: L4
Rule Name: Bollinger %B + Bandwidth
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1.13
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: BB mid
Recommendation: UNAVAILABLE
Source: Layer 4
Evidence:
- Score=1.13

--------------------------------

Check 005

Check ID: L5
Check Name: L5a — CVD Strength
Rule ID: L5
Rule Name: L5a — CVD Strength
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1.13
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: CVD 6742 UP
Recommendation: UNAVAILABLE
Source: Layer 5
Evidence:
- Score=1.13

--------------------------------

Check 006

Check ID: L52
Check Name: L5b — Volume / OI
Rule ID: L52
Rule Name: L5b — Volume / OI
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.98
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: Vol confirm
Recommendation: UNAVAILABLE
Source: Layer 52
Evidence:
- Score=0.98

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
Reason: Funding 0.0054
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
Actual: 1.13
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: LS 1.33
Recommendation: UNAVAILABLE
Source: Layer 7
Evidence:
- Score=1.13

--------------------------------

Check 009

Check ID: L8
Check Name: BTC 24h + 1H Momentum
Rule ID: L8
Rule Name: BTC 24h + 1H Momentum
Status: PASS
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 1.13
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: Change24h 0.744
Recommendation: UNAVAILABLE
Source: Layer 8
Evidence:
- Score=1.13

--------------------------------

Check 010

Check ID: L9
Check Name: Phiên giao dịch
Rule ID: L9
Rule Name: Phiên giao dịch
Status: WARNING
Weight: UNAVAILABLE
Priority: UNAVAILABLE
Actual: 0.75
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: Session
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
Actual: 1.13
Expected: 1.5
Threshold: UNAVAILABLE
Difference: UNAVAILABLE
Reason: 4/5 mục — đạt
Recommendation: UNAVAILABLE
Source: Layer 10
Evidence:
- Score=1.13

--------------------------------

# BLOCKERS

Hard Block: 0
Soft Block: 0
Unlock: 0

UNAVAILABLE

--------------------------------

# ENTRY EVIDENCE

One evidence set per check — emitted once in CHECKLIST, cross-referenced here.

| Check | Rule ID | Actual | Expected | Threshold | Difference | Priority | Unit | Reason | Recommendation | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | L1 | 1.5 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | LONG alignment | UNAVAILABLE | Layer 1 |
| RSI 14 + Divergence | L2 | 1.5 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | RSI optimal | UNAVAILABLE | Layer 2 |
| MACD + Histogram Momentum | L3 | 1.5 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Histogram dương | UNAVAILABLE | Layer 3 |
| Bollinger %B + Bandwidth | L4 | 1.13 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | BB mid | UNAVAILABLE | Layer 4 |
| L5a — CVD Strength | L5 | 1.13 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | CVD 6742 UP | UNAVAILABLE | Layer 5 |
| L5b — Volume / OI | L52 | 0.98 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Vol confirm | UNAVAILABLE | Layer 52 |
| Funding Rate + Trend | L6 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Funding 0.0054 | UNAVAILABLE | Layer 6 |
| L/S Ratio + Whale Wall | L7 | 1.13 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | LS 1.33 | UNAVAILABLE | Layer 7 |
| BTC 24h + 1H Momentum | L8 | 1.13 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Change24h 0.744 | UNAVAILABLE | Layer 8 |
| Phiên giao dịch | L9 | 0.75 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | Session | UNAVAILABLE | Layer 9 |
| Tâm lý & Kỷ luật | L10 | 1.13 | 1.5 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | 4/5 mục — đạt | UNAVAILABLE | Layer 10 |

--------------------------------

# ENTRY CONTRIBUTION

Contributions are copied from the engine — never summed here.

Giá & EMA (Slope): 1.5
RSI 14 + Divergence: 1.5
MACD + Histogram Momentum: 1.5
Bollinger %B + Bandwidth: 1.13
L5a — CVD Strength: 1.13
L5b — Volume / OI: 0.98
Funding Rate + Trend: 0.75
L/S Ratio + Whale Wall: 1.13
BTC 24h + 1H Momentum: 1.13
Phiên giao dịch: 0.75
Tâm lý & Kỷ luật: 1.13

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
Blockers: 0
  |
RuleBook State: PASS
  |
Entry Decision: ENTER
  |
Recommendation: VAO_TU_TIN

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

Passed Checks: 10
Warnings: 1
Failed Checks: 0
Hard Blocks: 0
Soft Blocks: 0
Unlock Rules: 0
Decision: ENTER
Confidence: ~70-75%
Grade: VÀO TỰ TIN
RuleBook State: PASS

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
| Giá & EMA (Slope) | UNAVAILABLE | 1.5 | 1.5 | PASS |
| RSI 14 + Divergence | UNAVAILABLE | 1.5 | 1.5 | PASS |
| MACD + Histogram Momentum | UNAVAILABLE | 1.5 | 1.5 | PASS |
| Bollinger %B + Bandwidth | UNAVAILABLE | 1.13 | 1.5 | PASS |
| L5a — CVD Strength | UNAVAILABLE | 1.13 | 1.5 | PASS |
| L5b — Volume / OI | UNAVAILABLE | 0.98 | 1.5 | PASS |
| Funding Rate + Trend | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L/S Ratio + Whale Wall | UNAVAILABLE | 1.13 | 1.5 | PASS |
| BTC 24h + 1H Momentum | UNAVAILABLE | 1.13 | 1.5 | PASS |
| Phiên giao dịch | UNAVAILABLE | 0.75 | 1.5 | WARNING |
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
Current ADX 1H: 26.113727569580078
Current ADX 4H: 23.018468856811523
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
