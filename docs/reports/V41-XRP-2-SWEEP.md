# V41-XRP-2 — Param sweep XRP (profit-first + **OOS-gate cứng trong sweep**)

**Ngày:** 2026-08-08  
**Symbol:** XRPUSDT · Confirm-B · `dedupeByBrokenLevel=true`  
**Baseline (XRP-1):** IS E[R] after **0.1963**, OOS E[R] after **0.1752**, IS WR **52.73%**  
**Windows (pinned):** IS `2025-08-08→2026-08-08` · OOS `2024-08-08→2025-08-08`  
**Script:** `scripts/backtest-v41-xrp-breakout-param-sweep.ts`  
**Khác SOL-4:** mọi combo chạy **IS + OOS trong cùng lần evaluate** — không chọn combo rồi mới test OOS.

---

## Verdict

### **0 combo** thỏa hết rào chắn

Giữ **NEAR default** (XRP-1 baseline) là lựa chọn thực dụng tốt nhất hiện có. Các combo “đẹp” trên E[R] (ví dụ IS/OOS ~0.78/0.81) chỉ còn **n≈10–11**, phụ thuộc quý nhỏ → **fail concentration / small-n** — đúng kiểu overfit / mẫu mỏng.

**Không** đề xuất production / allow-list / paper param-mới ở task này.

---

## Rào chắn (mọi combo)

| # | Gate | Ngưỡng |
|---|------|--------|
| 1 | IS E[R] after | ≥ **0.1963** |
| 2 | OOS E[R] after | ≥ **0.1752** (không chỉ ≥0) |
| 3 | IS WR% | > **52.73%** (ưu tiên phụ, sau 1+2) |
| 4 | Concentration IS & OOS | top quý dương / Σ dương ≤ **50%** |
| 5 | Small-n pos share IS & OOS | quý có **n&lt;5** không được &gt;**30%** R dương window |
| 6 | Cluster ≤6h | **không auto-loại** — ghi `cluster_note` |

Phương pháp: OFAT → pick promising → cartesian top-2/dim. **Evaluated = 274** unique combos.

---

## Kết quả tổng hợp

| Metric | Value |
|--------|------:|
| n_evaluated | **274** |
| pass both IS+OOS E[R] gates | **80** |
| pass_all (hết gate) | **0** |

### Phân bố lý do loại (có thể chồng)

| Reject reason | Count |
|---------------|------:|
| `is_wr_not_above_baseline` | 240 |
| `is_concentration>50%` | 215 |
| `oos_concentration>50%` | 208 |
| `is_er_below_baseline` | 178 |
| `oos_small_n_pos>30%` | 170 |
| `is_small_n_pos>30%` | 94 |
| `oos_er_below_baseline` | **89** |

**Phát hiện quan trọng:** trong 96 combo vượt IS E[R], chỉ **16** bị “giết” bởi OOS E[R] — phần lớn fail do **concentration / small-n / WR**, không phải vì OOS sụp kiểu SOL. Nghĩa: dễ “cải thiện” E[R] bằng cách **thắt filter → n mỏng**, nhưng gate ổn định (5)+(4) bắt được.

---

## Baseline dưới gate mới

NEAR default **không** `pass_all` (đúng kỳ vọng — gate WR “> baseline” loại chính nó; plus small-n OOS):

| | IS | OOS |
|--|---:|----:|
| E[R] after | 0.1963 ✓ | 0.1752 ✓ |
| WR% | 52.73 (fail “>”) | 51.52 |
| conc% | 41.1 ✓ | 46.0 ✓ |
| small-n | ok | **fail** Q2 n=3 share **36%** |
| cluster_n | 3 | 2 |

`reject_reason`: `is_wr_not_above_baseline|oos_small_n_pos>30%:Q2_n=3_share=36.0%`  
Cluster note: re-entry same-side ≤6h sau đóng lệnh (cùng mô hình XRP-1 / SOL OOS) — **không** tắt dedupe.

---

## Top combo gần đạt (pass cả 2 E[R], **không** pass_all)

### Near-miss A — E[R] cao nhất, mẫu mỏng

```
LOOKBACK=20, WIDTH=3, ATR=1, RETEST_MAX=10|5, BAND=0.005,
TP1_RR=2.5, strong=true, HOLD=80
```

| | IS | OOS |
|--|---:|----:|
| n | **11** | **10** |
| WR% | 54.5 | — |
| E[R] after | **0.777** | **0.806** |
| conc% | >50% **fail** | >50% **fail** |
| small-n | Q1 n=2 share 56.6% **fail** | — |

→ Có vẻ “siêu edge” nhưng **n quá nhỏ**; không đủ tin cậy cho paper param.

### Near-miss B — cùng họ, HOLD=40

IS E[R] 0.612 / OOS 0.608 · WR 50% (fail WR>) · vẫn conc + small-n.

### Near-miss C — WIDTH=3, ATR=1.5, strong=true, RR=1.5

IS/OOS E[R] ~0.393 · WR **60%** · vẫn conc>50% + small-n Q1/Q4.

**Chung:** combo vượt cả hai sàn E[R] thường **siết width / bật strong / RR cao** → trade ít → fail gate ổn định. Gate OOS cứng đã **ngăn** việc crowning những combo này như SOL-4 đã từng crowning IS-only.

---

## Kết luận

1. **Không có combo sweep** thỏa đồng thời cải thiện IS+OOS E[R] **và** ổn định (conc / small-n / WR).  
2. **NEAR default (XRP-1)** vẫn là điểm tham chiếu thực dụng: E[R] IS/OOS dương, conc ≤50%, n đủ lớn — dù chính nó fail “WR>self” và small-n OOS Q2 (đã flag từ XRP-1).  
3. Cải thiện “dễ nhìn” = thắt filter → **ảo giác** trên n nhỏ; OOS-gate + small-n đã bắt được **trong** sweep (không cần Task 4b bổ sung).  
4. **Khuyến nghị:** giữ params XRP-1; mọi nghiên cứu tiếp (cooldown side, paper) dựa **baseline**, không dựa near-miss A.  
5. **Vẫn không** production / allow-list breakout XRP ở task này.

---

## Việc còn lại (ngoài task)

| # | Việc |
|---|------|
| 1 | Nếu paper: dùng **XRP-1 default**, không dùng WIDTH=3 / RR=2.5 |
| 2 | Siết residual cluster ≤6h (cooldown) trên baseline — tách task |
| 3 | Allow-list production: quyết định riêng sau paper + giám sát OOS Q1 kém |

---

## Artefacts

| File |
|------|
| `docs/exports/v41-xrp-2-sweep-results.csv` |
| `docs/exports/v41-xrp-2-sweep-results-summary.json` |
| `scripts/backtest-v41-xrp-breakout-param-sweep.ts` |

---

## Task ID

**V41-XRP-2** · `pass_all=0` · Keep **NEAR default (XRP-1)** · No production
