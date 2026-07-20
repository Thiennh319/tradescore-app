# TASK 18.6.1 — GROUP BREAKDOWN QA Report (Group C vs Formula)

**Status:** DONE  
**Date:** 2026-07-20  
**Version:** V1.0.7  
**Parent:** TASK 18.6 Option B  
**Scope:** Export / documentation clarity only  
**Sample:** `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md`

**Confirmation:** No runtime scoring / Decision logic changed. Export layer only.

---

## 1. QA finding

In `# GROUP BREAKDOWN` for evidence trade `BTCUSDT-LONG-v4`:

| Field | Value |
| --- | ---: |
| Group C Raw Sum\* | 2.51 |
| Raw Max | 6 |
| Group Max | 5 |
| Formula `min(5, 2.51/6×5)` | **≈ 2.09** |
| Group Score shown | **2.07** |
| Delta | **0.02** |

Groups A and B matched the formula on reconstructed Raw Sum; only C looked inconsistent.  
Decision Total remained **7.27** (`snap.score`).

---

## 2. Root cause (code-verified)

### 2.1 Not reverse-fit

Production wire does **not** compute Group C as `Decision Total − A − B`.

| Column | Source |
| --- | --- |
| Group Score A/B/C | Copy `snap.groupScores` (engine) |
| Raw Sum\* | Reconstruct from Display: `round(display / 1.5 × 2)` per layer, then sum |
| Decision Total | Copy `snap.score` |

```ts
// services/exportTraceReviewWire.ts — buildRuleTraceGroupBreakdown
groupScore: gs.C,                 // engine groupScores.C
rawSum: rawSumFor(groupC.layers), // from display reverse
decisionTotal: snap.score,
```

### 2.2 Why formula ≠ Group Score C

Two independent columns:

1. **Raw Sum\*** — reconstructed from **rounded display** scores (not engine raw).
2. **Group Score** — authentic engine `groupScores.C` from the frozen snapshot.

Applying `convertToGroupScoreV4` to reconstructed Raw Sum can differ from engine Group Score by **≤ 0.03** after display rounding. That is expected under path (b).

### 2.3 Sample fixture confusion

The first Option B sample used `groupScores.C = 2.07` so that `2.82 + 2.38 + 2.07 = 7.27`.  
That made QA look like reverse-fit; **wire code never subtracted**. Fixture comments and export notes were updated to state this explicitly.

---

## 3. Frozen snapshot: are raw L8–L10 available?

**No.**

`snapshotFromV4` persists display layers + group scores only:

```ts
// services/signalBoardScan.ts — snapshotFromV4
layers: scoringLayersToDisplayV4(active.layers),
groupScores: active.groupScores,
// engine rawLayerScores are NOT copied onto SignalRowScorerSnapshot
```

Engine still has `rawLayerScores` at score time; they are **dropped** when building the frozen row.

| Classification | Detail |
| --- | --- |
| Bug in Decision / Group math? | **No** |
| Export reverse-fit bug? | **No** |
| Snapshot limitation? | **Yes** — enhancement candidate for a later version |

---

## 4. Resolution chosen: path (b)

Because engine raw is not on the frozen snapshot:

1. Keep **Group Score** = engine `groupScores` (no silent force-fit).
2. Keep **Decision Total** = `snap.score`.
3. Rename / mark reconstructed column as **`Raw Sum*`**.
4. Add export notes:
   - Raw Sum\* reconstructed from rounded Display Layer Scores.
   - Group Score copied from engine — **NOT** reverse-fitted from Decision Total.
   - `convertToGroupScoreV4(Raw Sum*)` may differ from Group Score by **≤ 0.03**; expected; not a scoring error.
5. Do **not** change Option B labels already accepted (DISPLAY LAYER SCORES, Hard Block scopes, TRACE note #9).

### Path (a) — enhancement (not in this task)

Persist `rawLayerScores` on `SignalRowScorerSnapshot` so GROUP BREAKDOWN can use engine raw and eliminate reconstruction variance.

---

## 5. Files updated in this QA pass

| File | Change |
| --- | --- |
| `services/aiExport/shared/renderTraceSection.ts` | GROUP BREAKDOWN notes + `Raw Sum*` header + Decision Total label |
| `services/exportTraceReviewWire.ts` | Comments + Notes column (`engine groupScores.*`) |
| `services/__tests__/exportTraceReviewWire.task186.optionB.test.ts` | Assert no force-fit; expect ≤0.03 note; regenerate sample |
| `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md` | Regenerated sample with QA notes |
| `docs/TASK18_6_SCORE_CONTRIBUTION_TOTAL_ROOT_CAUSE.md` | Parent report §7 |
| `docs/TASK18_6_1_GROUP_BREAKDOWN_QA.md` | **NEW** — this report |

---

## 6. Sample verification (after QA fix)

From `docs/RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md`:

| Check | Result |
| --- | --- |
| Decision Total (snap.score) = 7.27 | PASS |
| Group Score C = engine 2.07 (not forced to 2.09) | PASS |
| Raw Sum\* C = 2.51 (reconstructed) | PASS |
| Note: NOT reverse-fitted | PASS |
| Note: ≤0.03 variance expected | PASS |
| DISPLAY LAYER SCORES / Hard Block labels unchanged | PASS |

---

## 7. Sign-off

| Check | Result |
| --- | --- |
| Reverse-fit hypothesis rejected by code | PASS |
| Raw absence on snapshot documented | PASS |
| Path (b) notes shipped | PASS |
| Engine / Decision unchanged | PASS |
| Export layer only | **CONFIRMED** |

**No runtime scoring logic changed. Export layer only.**
