# Metadata

Version: 1
Trade ID: NEARUSDT-SHORT-v4
Coin: NEARUSDT
Side: SHORT
Strategy: v4
Timestamp: 2026-08-02T12:00:00.000Z
TradePlan Version: v4
Rule Version: UNAVAILABLE
Engine Version: 1.0.8

--------------------------------

# TRADE PLAN SUMMARY

Plan Status: CANCELLED
Headline: UNAVAILABLE
Summary: UNAVAILABLE
Confidence: 50%
Priority: UNAVAILABLE

--------------------------------

# ENTRY PLAN

Entry Price: UNAVAILABLE
Entry Zone: UNAVAILABLE
Preferred Entry: UNAVAILABLE
Maximum Entry: UNAVAILABLE
Reason: UNAVAILABLE

--------------------------------

# RISK PLAN

Stop Loss: UNAVAILABLE
Risk %: UNAVAILABLE
Maximum Loss: UNAVAILABLE
Risk Reward: UNAVAILABLE
Position Size: UNAVAILABLE
Leverage: UNAVAILABLE
Reason: UNAVAILABLE

--------------------------------

# TARGET PLAN

TP1: UNAVAILABLE
TP2: UNAVAILABLE
TP3: UNAVAILABLE
Scale Out: UNAVAILABLE
Trailing: UNAVAILABLE
Break Even: UNAVAILABLE

--------------------------------

# EXECUTION PLAN

Current Step: UNAVAILABLE
Next Step: UNAVAILABLE
Trigger: UNAVAILABLE
Condition: UNAVAILABLE
Fallback: UNAVAILABLE

--------------------------------

# POSITION MANAGEMENT PLAN

Initial Adviser State: UNAVAILABLE
Expected Adviser State: UNAVAILABLE
Protection: UNAVAILABLE
Scale Out: UNAVAILABLE
Close Condition: UNAVAILABLE

--------------------------------

# RULE REFERENCES

| Rule ID | Rule Name | Decision Source | Evidence Reference |
| --- | --- | --- | --- |
| UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

--------------------------------

# DEPENDENCIES

Rule Trace: SEE 01_RULEBOOK.md
  |
Score Trace: SEE 02_SCORE_ENGINE.md
  |
Entry Trace: SEE 03_ENTRY_DECISION.md
  |
Position Adviser Trace: SEE 04_POSITION_ADVISER.md

--------------------------------

# TRADEPLAN CONTRIBUTION

Contributions are copied from the engine — never derived here.

Entry: UNAVAILABLE
Risk: UNAVAILABLE
Targets: UNAVAILABLE
Management: UNAVAILABLE
Timing: UNAVAILABLE

--------------------------------

# PLAN BLOCKERS

UNAVAILABLE

--------------------------------

# PLAN CANCELLATION

Cancel Condition: UNAVAILABLE
Reason: UNAVAILABLE
Evidence: UNAVAILABLE

--------------------------------

# CONFLICT DETECTION

Entry Decision (frozen reference): WAIT
Position State (frozen reference): OPEN

Conflict: YES

Reason: Entry decision is WAIT while Position is OPEN

--------------------------------

# AI REVIEW

AI REVIEW CHECKLIST

| Review Item | Result | Notes |
| --- | --- | --- |
| Wrong Entry Plan | □ | |
| Wrong Risk Plan | □ | |
| Wrong TP Plan | □ | |
| Wrong Position Plan | □ | |
| Wrong Rule Reference | □ | |
| Missing Evidence | □ | |
| Plan Conflict | □ | |
| Missing Blocker | □ | |
| Need Optimization | □ | |
| TradePlan Consistency | □ | |

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

# HARD BLOCK ORIGIN

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
