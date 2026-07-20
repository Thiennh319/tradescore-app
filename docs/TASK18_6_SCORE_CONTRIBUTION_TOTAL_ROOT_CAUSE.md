# TASK 18.6 — SCORE CONTRIBUTION vs TOTAL Root-Cause Report

**Status:** OPTION B IMPLEMENTED  
**Version:** V1.0.7  
**Architecture:** LOCKED (engine unchanged)  
**Scope:** Export / label / Markdown only  
**Evidence trade:** `BTCUSDT-LONG-v4` (Rule Version: v4, Engine: 1.0.7)

---

## 1. Decision

**OPTION B selected:** Keep Decision Score / Group formula unchanged. Clarify export labels and add Group Breakdown so readers do not confuse Display Layer Scores with Decision Total.

Sample RULEBOOK: `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md`

---

## 2. Bug #1 root cause (unchanged)

Contribution lines = per-layer **display** scores (max 1.5).  
TOTAL = **group-normalized** Decision Score (A+B+C, max 15).  
Invariant `sum(display) === TOTAL` is false by engine design — not an arithmetic bug in either pipeline.

---

## 3. Option B implementation

| Change | Detail |
| --- | --- |
| Section rename | `# SCORE CONTRIBUTION` → `# DISPLAY LAYER SCORES` |
| Note | Display scores do NOT sum to Decision Total — see Group Breakdown |
| New section | `# GROUP BREAKDOWN` table (Raw Sum / Raw Max / Group Max / Group Score) + Decision Total |
| TRACE INTERPRETATION | Note #9: two independent scales |
| Issue #2 labels | `Hard Block (Rule Trace Scope)` vs `Hard Block(s) (Engine / All Sources)` |

Engine files **not** modified: `scorerV4.ts`, `constants/scoring.ts` (constants imported read-only for labels/rawMax).

---

## 4. Files touched (export layer)

| File | Change |
| --- | --- |
| `services/aiExport/shared/renderTraceSection.ts` | DISPLAY LAYER SCORES + GROUP BREAKDOWN renderers |
| `services/exportTraceReviewWire.ts` | Group breakdown wire; Hard Block labels; TRACE note #9 |
| `services/aiExport/ruleTrace/RuleTraceTypes.ts` | `groupBreakdown` input/output |
| `services/aiExport/ruleTrace/RuleTraceBuilder.ts` | Pass-through normalize of `groupBreakdown` |
| `services/aiExport/ruleTrace/ruleTracePresentation.ts` | Presentation DTO field |
| `services/aiExport/ruleTrace/RuleTraceFormatter.ts` | Wire new sections + Hard Block label |
| `services/aiExport/ruleTrace/__tests__/RuleTraceExport.test.ts` | Label / section order updates |
| `services/__tests__/exportTraceReviewWire.selfdoc.test.ts` | Hard Block label |
| `services/__tests__/exportTraceReviewWire.task186.optionB.test.ts` | **NEW** — Option B invariants |
| `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md` | **NEW** — sample RULEBOOK |
| `docs/TASK18_6_SCORE_CONTRIBUTION_TOTAL_ROOT_CAUSE.md` | This report (updated) |

---

## 5. Sample verification (BTCUSDT-LONG-v4 evidence numbers)

| Check | Expected | Result |
| --- | --- | --- |
| Decision Total | 7.27 (`snap.score`) | PASS |
| Display lines | same 11 values (e.g. +1.13, +0.98) | PASS |
| Section title | DISPLAY LAYER SCORES | PASS |
| Group Score | copied from engine `groupScores` | PASS |
| Raw Sum\* vs Group Score | may differ ≤0.03 (reconstruction) | PASS (documented) |

> Do **not** require `A+B+C === Decision Total` when Raw Sum\* is reconstructed from Display. See §7 / `docs/TASK18_6_1_GROUP_BREAKDOWN_QA.md`.

---

## 6. Sign-off (Option B)

| Check | Result |
| --- | --- |
| Option B implemented | PASS |
| Engine / Decision formula unchanged | PASS |
| Export tests green | PASS |
| Sample RULEBOOK exported | PASS |

**No runtime scoring logic changed. Export / label layer only.**

---

## 7. QA follow-up — Group C vs formula (2026-07-20)

Full report: [`docs/TASK18_6_1_GROUP_BREAKDOWN_QA.md`](TASK18_6_1_GROUP_BREAKDOWN_QA.md)

### Findings

| Question | Answer |
| --- | --- |
| Does export reverse-fit Group C as `Total − A − B`? | **No.** Code copies `snap.groupScores.C`. |
| Where does Group Score come from? | `gs.A/B/C` from frozen `groupScores` |
| Where does Raw Sum* come from? | Reconstructed: `display / 1.5 × 2` per layer, then summed |
| Are engine `rawLayerScores` in the frozen snapshot? | **No.** `snapshotFromV4` only stores `scoringLayersToDisplayV4(layers)` + `groupScores`. |

```ts
// services/signalBoardScan.ts — snapshotFromV4
layers: scoringLayersToDisplayV4(active.layers),
groupScores: active.groupScores,
// rawLayerScores is NOT copied onto SignalRowScorerSnapshot
```

```ts
// services/exportTraceReviewWire.ts — buildRuleTraceGroupBreakdown
groupScore: gs.C,  // engine copy
rawSum: rawSumFor(groupC.layers),  // from display reverse
decisionTotal: snap.score,
```

Sample fixture had previously chosen `C: 2.07` so `2.82+2.38+2.07=7.27` — that made QA look like reverse-fit, but production wire never subtracts.

### Resolution (path **b** — raw not in snapshot)

- Keep Group Score = engine `groupScores` (no silent force-fit).
- Keep Decision Total = `snap.score`.
- Label Raw Sum as reconstructed (`Raw Sum*`).
- Export note: convert on reconstructed raw may differ from Group Score by **≤0.03**; expected; not a scoring bug.
- **Enhancement (later):** persist `rawLayerScores` on the frozen snapshot so GROUP BREAKDOWN can use engine raw (path **a**) and eliminate reconstruction variance.

**No engine / Decision formula change.**
