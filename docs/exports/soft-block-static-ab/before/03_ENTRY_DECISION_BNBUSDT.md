# Metadata

Version: 1
Trade ID: BNBUSDT-SHORT-v4
Coin: BNBUSDT
Side: SHORT
Timestamp: 2026-07-26T12:22:54.943Z
Rule Version: UNAVAILABLE
Entry Version: v4
Score Version: UNAVAILABLE
Engine Version: 1.0.8

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: YES
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: TRENDING
ADX1h: 40.086421966552734
ADX4h: 15.13349437713623
ATR1h: 1.319026231765747
CVD: -77291.1640625
Change24h: 1.13
CvdTrend: DOWN
Decision: CO_THE_VAO
Direction: SHORT
Entry Permission: YES
Entry State: WAIT_ENTRY
Funding: 0.010218
Group Block Count: 0
Hard Block (Engine / All Sources): 0
Hard/Group Blocked State: NO
Price: 571.9
RegimeConfidence: 0.65
Score: 9.06
Score Block Count: 0
TopLSRatio: 3.3516
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
Reason: CÓ THỂ VÀO
Summary: CÓ THỂ VÀO
Confidence: ~65%
Grade: CÓ THỂ VÀO

--------------------------------

# DECISION TREE

UNAVAILABLE

--------------------------------

# CHECKLIST

UNAVAILABLE

--------------------------------

# BLOCKERS

Hard Block: 0
Group Block: 0
Soft Block: 0
Unlock: 0

UNAVAILABLE

--------------------------------

# ENTRY EVIDENCE

One evidence set per check — emitted once in CHECKLIST, cross-referenced here.

| Check | Rule ID | Actual | Expected | Threshold | Difference | Priority | Unit | Reason | Recommendation | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

--------------------------------

# ENTRY CONTRIBUTION

Contributions are copied from the engine — never summed here.

UNAVAILABLE

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
Checklist: 0
  |
Blockers: 0
  |
RuleBook State: PASS
  |
Entry Decision: ENTER
  |
Recommendation: CO_THE_VAO

--------------------------------

# ENTRY DEPENDENCY

UNAVAILABLE

--------------------------------

# CONFLICT DETECTION

Conflict: NO

--------------------------------

# ENTRY SUMMARY

Passed Checks: 0
Warnings: 0
Failed Checks: 0
Hard Blocks: 0
Group Blocks: 0
Soft Blocks: 0
Unlock Rules: 0
Decision: ENTER
Confidence: ~65%
Grade: CÓ THỂ VÀO
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
| UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

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
Current ADX 1H: 40.086421966552734
Current ADX 4H: 15.13349437713623
Market Regime: TRENDING
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
