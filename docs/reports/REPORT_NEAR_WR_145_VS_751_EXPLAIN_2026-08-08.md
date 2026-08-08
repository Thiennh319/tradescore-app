# REPORT — Giải thích WR 54.55% (145 simulate vs 751 PASS)

**Ngày:** 2026-08-08  
**Phạm vi:** Chỉ đọc code — không sửa.  
**Nguồn:** `scripts/verify-fix-hard-reason-labeling-near-180d.ts` + `simulateFromCache` trong `scripts/backtest-v4-near-90d.ts`.

---

## 1. Vì sao chỉ 145 / 751 được simulate?

Hai số **không cùng định nghĩa**.

| Số | Định nghĩa trong verify |
|----|-------------------------|
| **751 PASS** | Mỗi bar trong `cache` có `canEnterRaw === true` (`classify` ← `canEnterV4(active)` only) — **mọi nến** còn pass scorer, kể cả chuỗi liên tiếp. |
| **145 simulate** | `simulateFromCache(..., ambiguityThreshold=2.5)` — chỉ nến thỏa **đủ** filter trade mở. |

Phễu trong `simulateFromCache` (bỏ / không mở lệnh):

```1715:1732:scripts/backtest-v4-near-90d.ts
    const ambiguous = ambigState.status === 'AMBIGUOUS';
    // Live applyAmbiguityToSnapshot: canEnter=false when AMBIGUOUS
    const enterOk = bar.canEnterRaw && !ambiguous;

    if (i <= inPositionUntil) {
      prevCanEnter = false;
      continue;
    }

    const rising = enterOk && !prevCanEnter;
    prevCanEnter = enterOk;

    if (!enterOk) continue;
    canEnterCount += 1;

    const plan = bar.plan;
    if (!plan || !plan.isValid || !plan.tradePlanValid) continue;
    if (!rising) continue;
```

| Điều kiện loại | Ý nghĩa cụ thể |
|----------------|----------------|
| **Ambiguity** | `enterOk = canEnterRaw && !AMBIGUOUS` (thr 2.5) — PASS scorer nhưng Long/Short quá sát → **không** coi là entry live. |
| **Đang trong lệnh** | `i <= inPositionUntil` — sau khi mở trade, skip bars tới khi exit (`inPositionUntil = i + exit.barsHeld`). |
| **plan thiếu / invalid** | `!plan \|\| !plan.isValid \|\| !plan.tradePlanValid` — có thể `canEnterRaw` nhưng plan null/không valid. |
| **Không rising edge** | `rising = enterOk && !prevCanEnter` — **chỉ nến đầu** của chuỗi `enterOk` liên tiếp; các nến PASS trùng streak sau nến đầu bị bỏ (phần lớn của 751−145). |

→ **606** không phải “FAIL scorer”, mà chủ yếu: (a) cùng streak PASS không rising, (b) ambiguity, (c) overlap vị thế, (d) plan chưa valid.

---

## 2. 54.55% tính trên gì? Công thức?

**Trên 145 trade simulate** (sau filter trên), **không** trên 751.

Verify:

```161:162:scripts/verify-fix-hard-reason-labeling-near-180d.ts
  const sim = simulateFromCache(bundle, cache, 2.5);
  const wr = wrOfTrades(sim.trades);
```

```141:148:scripts/verify-fix-hard-reason-labeling-near-180d.ts
function wrOfTrades(
  trades: { resultR: number; exitReason: string }[],
): number | null {
  const decided = trades.filter((t) => t.exitReason !== 'TIMEOUT' && Number.isFinite(t.resultR));
  if (decided.length === 0) return null;
  const wins = decided.filter((t) => t.resultR > 0).length;
  return (100 * wins) / decided.length;
}
```

Công thức:

\[
\mathrm{WR\%} = 100 \times \frac{\#\{\,t \in \mathrm{sim.trades}:\ \mathrm{exitReason}\neq\mathrm{TIMEOUT}\ \land\ \mathrm{resultR}>0\,\}}{\#\{\,t:\ \mathrm{exitReason}\neq\mathrm{TIMEOUT}\ \land\ \mathrm{resultR}\ \mathrm{finite}\,\}}
\]

`sim.trades.length = 145` (log verify). TIMEOUT bị loại khỏi mẫu WR.

---

## 3. Có phải suite >70% WR NEAR trước đây không?

### **Không phải cùng “headline >70%” theo nghĩa đo winrate chính thức đã công bố.**

| | Verify labeling (54.55%) | Suite NEAR WR cao trước đây (vd ≥70–79%) |
|--|--------------------------|------------------------------------------|
| Mục đích | A/B **label** hard-reason (pass/fail identity) | Đo / tối ưu WR–EV chiến lược |
| Entry count trong report | 751 = mọi `canEnterRaw` tick | Thường = **rising + planValid** trades (hoặc tập đã filter layer) |
| WR | Trên ~145 simulate decisions (trừ TIMEOUT) | Trên tập lệnh mở được (CSV `near_backtest_180d*.csv`) — vd CVD220 baseline WR ~**72.7%** / filter L3≥2 WR ~**80%+** |
| Suite code | Shared helpers `backtest-v4-near-90d` + verify script | Cùng họ V4 NEAR 180d, nhưng **báo cáo tối ưu** dùng CSV/filter/proposal riêng — không phải metric “751 PASS tick” |

**Kết luận:** Suite verify này **kế thừa engine/sim** của V4 NEAR 180d, nhưng **metric 54.55%** là WR phụ trên tập rising+planValid (n≈145) phục vụ chứng minh “label không đổi rule” — **không** thay thế / bác số WR >70% trên các báo cáo tối ưu NEAR trước đây (khác định nghĩa mẫu lệnh / có thể khác filter CVD-S1 / L3 gate).

---

## Task ID

**REPORT-NEAR-WR-145-VS-751-EXPLAIN** · 2026-08-08 · report-only
