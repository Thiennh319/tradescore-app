# TASK 18.6 FINAL — Pre-Merge Sign-Off (SINGLE SOURCE)

**Status:** AWAITING HUMAN MERGE SIGN-OFF  
**Date:** 2026-07-20  
**Version:** V1.0.7  
**Scope:** Export / label layer only (Option B + Group Breakdown QA 18.6.1)  
**Principle:** Evaluate ONLY exported values

**Confirmation:** No runtime scoring / Decision formula changed in TASK 18.6 or 18.6.1.

This is the **only** pre-merge verification report for Option B.  
Supersedes and replaces (deleted):

- `docs/TASK18_6_PREMERGE_VERIFICATION.md`
- `docs/TASK18_6_2_PREMERGE_VERIFICATION.md`
- `docs/TASK18_6_2_PRE_MERGE_EVIDENCE.md`

Related (kept, not duplicates):

- `docs/TASK18_6_SCORE_CONTRIBUTION_TOTAL_ROOT_CAUSE.md`
- `docs/TASK18_6_1_GROUP_BREAKDOWN_QA.md`
- `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md` (same full body as §6 below)

---

## 1. Acceptance (product direction)

| Item | Decision |
| --- | --- |
| Option B | Keep Decision Score / Group formula; clarify export labels only |
| Group C | Engine `groupScores.C` — **not** reverse-fitted from Decision Total |
| Raw Sum* | Reconstructed from rounded Display; ≤0.03 variance vs Group Score is expected |

---

## 2. Checklist (must be verified in §6 full export, not by this table alone)

| # | Requirement | Location |
| --- | --- | --- |
| a | Header `Raw Sum*` on all 3 groups | `# GROUP BREAKDOWN` |
| b | ≤0.03 rounding note | end of `# GROUP BREAKDOWN` |
| c | NOT reverse-fitted note | end of `# GROUP BREAKDOWN` |
| d | Group Score C = 2.07 | row C |
| e | Decision Total = 7.27 | `Decision Total (snap.score)` |
| f | `Hard Block (Rule Trace Scope)` | `# RULE SUMMARY` |
| g | `Hard Block(s) (Engine / All Sources)` | INPUT / BLOCKING SUMMARY |
| h | TRACE note #9 (two scales) | `# TRACE INTERPRETATION` |

---

## 3. `scorerV4.ts` / `constants/scoring.ts` — unrelated dirty diff (merge gate)

### 3a. Does the scorerV4 dirty diff sit in the same PR/commit as Option B?

**No — it must not.**  
Current working tree:

- Option B export work is largely **untracked** (`services/aiExport/`, `exportTraceReviewWire.ts`, Option B tests, sample md).
- `services/scorerV4.ts` and `services/scorerV3.ts` show **separate** dirty modifications: L10 `psychologyChecklistReasonText` (reason **display text only**).
- That L10 reason-text change is **not** part of TASK 18.6 / 18.6.1 Option B.

If everything is staged together by mistake, the L10 text would ride along — **that is forbidden for this merge**.

### 3b. Split requirement

- **Option B PR / commit:** export/wire/ruleTrace/presentation/docs/tests for DISPLAY LAYER SCORES + GROUP BREAKDOWN + Hard Block label scopes only.  
  **Do NOT include** `services/scorerV4.ts` or `services/scorerV3.ts`.
- **L10 reason-text:** separate branch/PR (or leave unstaged / revert on Option B branch).

### 3c. Raw `git diff` (2026-07-20)

#### `git diff -- services/scorerV4.ts`

```diff
diff --git a/services/scorerV4.ts b/services/scorerV4.ts
index b38dd96..1d35a9a 100644
--- a/services/scorerV4.ts
+++ b/services/scorerV4.ts
@@ -947,6 +947,24 @@ function psychologyChecklistForV4(input: AnalysisInputV4): PsychologyChecklistV3
   };
 }
 
+/** Reason copy for L10 checklist count — display text only, no score impact. */
+function psychologyChecklistReasonText(checked: number): string {
+  switch (checked) {
+    case 5:
+      return '5/5 mục — đạt tối đa';
+    case 4:
+      return '4/5 mục — đạt';
+    case 3:
+      return '3/5 mục — đạt tối thiểu';
+    case 2:
+      return '2/5 mục — chưa đủ, tâm lý chưa sẵn sàng';
+    case 1:
+      return '1/5 mục — không đạt';
+    default:
+      return '0/5 mục — không đạt';
+  }
+}
+
 export function scoreL10V4(
   checklist: PsychologyChecklistV3,
   todayStats: TodayStats,
@@ -991,10 +1009,8 @@ export function scoreL10V4(
     score = Math.max(0, score - 0.5);
   }
 
-  const reason =
-    checked === total
-      ? `${checked}/${total} mục — sẵn sàng`
-      : `${checked}/${total} mục — chưa đủ`;
+  // Reason text only — PASS/block thresholds & score unchanged.
+  const reason = psychologyChecklistReasonText(checked);
 
   return {
     layerResult: layerC(10, score, reason),
```

#### `git diff -- constants/scoring.ts`

```text
(empty — no diff)
```

Also present (same L10 reason-text family, also **out of Option B scope**): `services/scorerV3.ts` (+24/−4).

---

## 4. Vitest — raw console (verbose)

Command:

```text
npx vitest run services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts services/__tests__/exportTraceReviewWire.selfdoc.test.ts services/__tests__/exportTraceReviewWire.task186.optionB.test.ts --reporter=verbose
```

```text

 RUN  v4.1.8 D:/Thiennh3/APP/Trading/TradeScore

 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Empty Rule — exports full document with UNAVAILABLE sections 7ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Single Rule — full journey exported (status/weight/priority/evidence) 30ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > All PASS — summary counts all matched, no conflict 1ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Mixed PASS FAIL — both statuses traced and counted 3ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Hard Block — counted in summary and shown in decision chain 2ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Soft Block — counted separately from hard block 2ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Unlock — unlock rules counted and disabled rule ignored 2ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Priority Tree — sorted descending, highest priority wins 9ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Decision Chain — Input → Matched → Score → Hard Block → Decision → Recommendation 1ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Conflict — hard block overriding passing rules is detected with reason 1ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Display Layer Scores — copied verbatim with sign (no Decision Total in this section) 1ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Markdown Format — all sections present in order, checklist complete 2ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > Stable Output — deterministic, byte-identical, input not mutated 1ms
 ✓ services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts > TASK 16.2 Rule Trace Export > No Undefined / No Null — literals never leak, no JSON dump 2ms
 ✓ services/__tests__/exportTraceReviewWire.task186.optionB.test.ts > TASK 18.6 Option B — RULEBOOK export labels + Group Breakdown > uses DISPLAY LAYER SCORES + GROUP BREAKDOWN; Decision Total matches snap.score 17ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > every trace carries TRACE INTERPRETATION, PRE-FILTERS, BLOCKING SUMMARY, HARD BLOCK ORIGIN 25ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > review exports are NOT touched by the trace appendix 20ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 1 — SCORE NORMALIZATION documents internal vs display scale 2ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 1 — missing vwapBonus renders UNAVAILABLE, never fabricated 1ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 2 — HARD BLOCK ORIGIN identifies the source list of each block 2ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 3 — BLOCKING SUMMARY replaces the mandatory-count wording 1ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 4 — PRE-FILTERS renders ADX Gate as a Gate, not a Rule 1ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > PART 4 — missing ADX gate renders UNAVAILABLE 1ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > appendix output is deterministic and never leaks undefined/null/JSON 9ms
 ✓ services/__tests__/exportTraceReviewWire.selfdoc.test.ts > TRACE SELF-DOCUMENTATION appendix (V1.0.7) > does not mutate the frozen row 4ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  11:09:16
   Duration  10.13s (transform 3.36s, setup 0ms, import 12.29s, tests 155ms, environment 11.67s)

```

---

## 5. Merge gate summary

| Gate | Status |
| --- | --- |
| Full sample in §6 (end-to-end) | YES |
| Checklist a–h verifiable in export body | YES |
| Vitest 25/25, 0 fail | YES |
| `constants/scoring.ts` diff empty | YES |
| `scorerV4` / `scorerV3` L10 reason-text **excluded** from Option B staged set | **CONFIRMED** — not in `git diff --cached`; remain dirty WT only (left for separate branch/PR or stash) |

**Staged Option B set (13 files):** export wire + ruleTrace Option B surfaces + selfdoc/optionB tests + 18.6/18.6.1 docs + sample.  
**Explicitly NOT staged:** `services/scorerV3.ts`, `services/scorerV4.ts`.

**Awaiting human sign-off to merge Option B only.**

---

## 6. FULL EXPORT — `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md`

(The following is the complete file contents, start to end.)


# Metadata

Version: 1
Generated Time: 2026-07-20T00:00:00.000Z
Trade ID: BTCUSDT-LONG-v4
Rule Version: v4
Engine Version: 1.0.7
Coin: BTCUSDT
Side: LONG

--------------------------------

# INPUT SNAPSHOT

ADX Gate Allowed: UNAVAILABLE
ADX Gate Block Reason: UNAVAILABLE
ADX Gate Regime: UNAVAILABLE
ADX1h: UNAVAILABLE
ADX4h: UNAVAILABLE
ATR1h: UNAVAILABLE
CVD: UNAVAILABLE
Change24h: 1.2
CvdTrend: UNAVAILABLE
Decision: KHONG_VAO
Direction: LONG
Entry Permission: NO
Entry State: HARD_BLOCKED
Funding: UNAVAILABLE
Group Block Count: 0
Hard Block (Engine / All Sources): 1
HardBlocked State: YES
Price: 64000
RegimeConfidence: 0.7
Score: 7.27
Score Block Count: UNAVAILABLE
TopLSRatio: UNAVAILABLE
Total Blocking Events: 1
Trend: BULLISH
Warning Count: 0

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
Reason: Giá & EMA (Slope) ok
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
Reason: RSI 14 + Divergence ok
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
Actual: 0.75
Reason: MACD + Histogram Momentum ok
Recommendation: OK
Source Module: Layer 3
Evidence:
- Score=0.75

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
Reason: Bollinger %B + Bandwidth ok
Recommendation: Review Layer
Source Module: Layer 4
Evidence:
- Score=0

--------------------------------

Rule 005

L5a — CVD Strength

Status: PASS
Weight: 1.5
Priority: 100
Block Type: NONE
Mandatory: YES
Expected: 1.5
Actual: 0.75
Reason: L5a — CVD Strength ok
Recommendation: OK
Source Module: Layer 5
Evidence:
- Score=0.75

--------------------------------

Rule 006

L5b — Volume / OI

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0.98
Reason: L5b — Volume / OI ok
Recommendation: OK
Source Module: Layer 52
Evidence:
- Score=0.98

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
Reason: Funding Rate + Trend ok
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
Actual: 0.75
Reason: L/S Ratio + Whale Wall ok
Recommendation: OK
Source Module: Layer 7
Evidence:
- Score=0.75

--------------------------------

Rule 009

BTC 24h + 1H Momentum

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0.75
Reason: BTC 24h + 1H Momentum ok
Recommendation: OK
Source Module: Layer 8
Evidence:
- Score=0.75

--------------------------------

Rule 010

Phiên giao dịch

Status: WARNING
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 0
Reason: Phiên giao dịch ok
Recommendation: Review Layer
Source Module: Layer 9
Evidence:
- Score=0

--------------------------------

Rule 011

Tâm lý & Kỷ luật

Status: PASS
Weight: 1.5
Priority: 50
Block Type: NONE
Mandatory: NO
Expected: 1.5
Actual: 1.13
Reason: Tâm lý & Kỷ luật ok
Recommendation: OK
Source Module: Layer 10
Evidence:
- Score=1.13


--------------------------------

# RULE EVALUATION TABLE

| Rule | PASS | FAIL | Weight | Priority |
| --- | --- | --- | --- | --- |
| Giá & EMA (Slope) | YES | - | 1.5 | 50 |
| RSI 14 + Divergence | YES | - | 1.5 | 50 |
| MACD + Histogram Momentum | YES | - | 1.5 | 50 |
| Bollinger %B + Bandwidth | - | - | 1.5 | 50 |
| L5a — CVD Strength | YES | - | 1.5 | 100 |
| L5b — Volume / OI | YES | - | 1.5 | 50 |
| Funding Rate + Trend | YES | - | 1.5 | 50 |
| L/S Ratio + Whale Wall | YES | - | 1.5 | 50 |
| BTC 24h + 1H Momentum | YES | - | 1.5 | 50 |
| Phiên giao dịch | - | - | 1.5 | 50 |
| Tâm lý & Kỷ luật | YES | - | 1.5 | 50 |

--------------------------------

# RULE SUMMARY

Matched Rules: 9
Failed Rules: 0
Ignored Rules: 0
Blocked Rules: 0
Soft Block: 0
Hard Block (Rule Trace Scope): 0
Unlock Rules: 0

--------------------------------

# PRIORITY TREE

Priority (high wins over low):

100
  L5a — CVD Strength [PASS]
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
  Phiên giao dịch [WARNING]
50
  Tâm lý & Kỷ luật [PASS]

--------------------------------

# DISPLAY LAYER SCORES

Display Layer Scores are per-layer normalized values for reference.
They do NOT sum directly to the Decision Total — see Group Breakdown below.

Giá & EMA (Slope): +1.13
RSI 14 + Divergence: +1.5
MACD + Histogram Momentum: +0.75
Bollinger %B + Bandwidth: 0
L5a — CVD Strength: +0.75
L5b — Volume / OI: +0.98
Funding Rate + Trend: +0.38
L/S Ratio + Whale Wall: +0.75
BTC 24h + 1H Momentum: +0.75
Phiên giao dịch: 0
Tâm lý & Kỷ luật: +1.13

--------------------------------

# GROUP BREAKDOWN

Decision Total is copied from the frozen snap.score (Group scale; max 15).
Group Score columns are copied from engine groupScores on the snapshot.

| Group | Layers | Raw Sum* | Raw Max | Group Max | Group Score | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | L1–L4 | 4.51 | 8 | 5 | 2.82 | engine groupScores.A |
| B | L5a, L5b, L6, L7 | 3.82 | 8 | 5 | 2.38 | engine groupScores.B |
| C | L8–L10 | 2.51 | 6 | 5 | 2.07 | engine groupScores.C |

Decision Total (snap.score): 7.27

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

Input: BTCUSDT LONG
  |
Matched Rules: 9
  |
Score: 7.27
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
| Giá & EMA (Slope) | UNAVAILABLE | 1.13 | 1.5 | PASS |
| RSI 14 + Divergence | UNAVAILABLE | 1.5 | 1.5 | PASS |
| MACD + Histogram Momentum | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Bollinger %B + Bandwidth | UNAVAILABLE | 0 | 1.5 | WARNING |
| L5a — CVD Strength | UNAVAILABLE | 0.75 | 1.5 | PASS |
| L5b — Volume / OI | UNAVAILABLE | 0.98 | 1.5 | PASS |
| Funding Rate + Trend | UNAVAILABLE | 0.38 | 1.5 | PASS |
| L/S Ratio + Whale Wall | UNAVAILABLE | 0.75 | 1.5 | PASS |
| BTC 24h + 1H Momentum | UNAVAILABLE | 0.75 | 1.5 | PASS |
| Phiên giao dịch | UNAVAILABLE | 0 | 1.5 | WARNING |
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

# HARD BLOCK ORIGIN

Every blocking event below is copied verbatim from the frozen snapshot.
Source identifies the exact engine list the entry was copied from.

| Blocking Event | Source | Owner | Layer / Scope | Reason |
| --- | --- | --- | --- | --- |
| L3 MACD vi phạm | Score Engine hard block list (per-side) | RuleBook Hard Block rules | Scoring layer / market filter | L3 MACD vi phạm |

Condition / Current Value pairs: UNAVAILABLE
(The frozen snapshot stores block reason strings only; numeric
condition/current pairs are not part of the snapshot.)

--------------------------------

# BLOCKING SUMMARY

Hard Blocks (Engine / All Sources): 1
Group Blocks: 0
Score Blocks (block reasons): UNAVAILABLE
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
