# REPORT — NEAR V4 · Tối ưu ngưỡng L1 / L3 / L6 (đề xuất, chờ duyệt)

**Date:** 2026-08-02  
**Nguồn:** `docs/exports/near_backtest_180d.csv` (V4 production path, 180d)  
**Phân tích JSON:** `docs/exports/near_v4_l1l3l6_optimize.json`  
**Baseline:** n=86 · WR **79.07%** · EV **+0.55R** · **100% SHORT** (bias bear — không ngoại suy LONG)  
**Phạm vi:** **KHÔNG** sửa `constants/scoring.ts` / `scorerV4.ts`. Chỉ báo cáo.

---

## 0. Định nghĩa “ngưỡng” trong báo cáo này

Trên CSV, L1/L3/L6 đã là **điểm layer 0–2** (sau quy đổi), không phải % funding thô.

| Layer | Giá trị xuất hiện trên 86 lệnh | Ý nghĩa scorer (SHORT) |
|---|---|---|
| L1 | `{0, 1, ≈1.333, 2}` | 2 = EMA đồng thuận + slope↓; 1.333 = MTF conflict; 1 = partial; 0 = không đồng thuận |
| L3 | `{1, 1.5, 2}` | 2 = hist âm cả 1H&4H; 1.5 = cắt 0 / bẻ góc; 1 = chỉ 1 khung |
| L6 | `{0, 1, 1.5}` *(không có 2 trên mẫu entered)* | 1.5 = euphoria/elevated long-side funding; 1 = NEUTRAL; 0 = squeeze building |

**Gate `L* ≥ x`** = post-filter / min score trên lệnh đã `canEnter` — **không** đồng nghĩa đã đổi EMA/%B/funding formula bên trong.

Constants liên quan (shared multi-symbol):

| Mục | File | Giá trị hiện tại | Có “min score L1/L3/L6” không? |
|---|---|---|---|
| L1 logic | `scorerV4.ts` `scoreL1V4` | Bậc rời 0 / 1 / 1.33 / 1.5 / 2 theo EMA | **Không** có hằng `L1_MIN` |
| L3 logic | `scoreL3V4` | Bậc 0 / 1 / 1.5 / 2 theo MACD hist | **Không** có hằng `L3_MIN` |
| L6 state → điểm | `SHORT_L6_BY_STATE` + `FUNDING_STATE_THRESHOLDS` | vd Extreme long → 2đ; Elevated/Fading → 1.5; Neutral → 1 | Có ngưỡng **funding %** (0.01, 0.005, −0.005…) — **shared** |
| Mandatory layers | `MANDATORY_LAYERS_V2` = [1,3,6,8,9,10] | Bắt buộc có mặt trong pipeline | Không set floor điểm |

→ Mọi đề xuất “L1≥1.5 / L3≥2 / L6≥1.5” nếu áp vào engine = **thêm gate min-score** (nên **NEAR-only**), hoặc đổi mapping state (ảnh hưởng BTC/SOL/BNB nếu sửa shared).

---

## PHẦN 1 — Đường cong ngưỡng từng layer

Cột **n mất** = % lệnh mất so với base 86.  
**Sweet spot** (quy ước báo cáo): WR tăng ≥ ~+3pp và **giữ ≥ 50% n** (không mất >50%).

### L1 Trend

| Ngưỡng | n | WR% | EV | n mất | Sweet? |
|---|---:|---:|---:|---:|:---:|
| ≥ 0 (base) | 86 | 79.07 | +0.553 | 0% | — |
| ≥ 0.5 / ≥ 1 | 82 | 79.27 | +0.561 | 4.7% | không (+WR nhỏ) |
| **≥ 1.5** | **57** | **84.21** | **+0.671** | **33.7%** | **có** |
| ≥ 2 | 57 | 84.21 | +0.671 | 33.7% | có (= ≥1.5 trên mẫu này*) |

\*Trên mẫu không có L1=1.5 đúng nghĩa; L1≥1.5 ≡ L1=2 (loại 0 / 1 / 1.33).

**Sweet spot L1:** **≥ 1.5 (thực chất yêu cầu full đồng thuận = 2đ)**.

### L3 MACD

| Ngưỡng | n | WR% | EV | n mất | Sweet? |
|---|---:|---:|---:|---:|:---:|
| ≥ 0 … ≥ 1 | 86 | 79.07 | +0.553 | 0% | — |
| ≥ 1.5 | 65 | 81.54 | +0.613 | 24.4% | biên (WR +2.5pp) |
| **≥ 2** | **52** | **86.54** | **+0.765** | **39.5%** | **có** |

**Sweet spot L3:** **≥ 2** (hist âm cả 2 khung).

### L6 Funding

| Ngưỡng | n | WR% | EV | n mất | Sweet? |
|---|---:|---:|---:|---:|:---:|
| ≥ 0 | 86 | 79.07 | +0.553 | 0% | — |
| ≥ 0.5 / ≥ 1 | 81 | 77.78 | +0.542 | 5.8% | **không** (WR giảm) |
| **≥ 1.5** | **51** | **86.27** | **+0.671** | **40.7%** | **có** |
| ≥ 2 | 0 | n/a | n/a | 100% | loại |

**Sweet spot L6:** **≥ 1.5** (loại NEUTRAL=1). Không có lệnh entered với L6=2 trên 180d này.

---

## PHẦN 2 — Tổ hợp 2–3 layer

| Tổ hợp | n | WR% | EV | n mất | n≥25–30? |
|---|---:|---:|---:|---:|:---:|
| L1≥1.5 | 57 | 84.21 | +0.671 | 33.7% | ✅ |
| L3≥2 | 52 | 86.54 | +0.765 | 39.5% | ✅ |
| L6≥1.5 | 51 | 86.27 | +0.671 | 40.7% | ✅ |
| L1≥1.5 & L3≥1.5 | 42 | 88.10 | +0.776 | 51.2% | ✅ (n≥30) |
| **L1≥1.5 & L3≥2** | **35** | **91.43** | **+0.903** | **59.3%** | ✅ |
| L1≥1.5 & L6≥1.5 | 33 | 90.91 | +0.778 | 61.6% | ✅ |
| **L3≥2 & L6≥1.5** | **30** | **96.67** | **+0.950** | **65.1%** | ✅ biên |
| L1≥1.5 & L3≥1.5 & L6≥1.5 | 23 | 95.65 | +0.931 | 73.3% | ❌ n&lt;25 |
| L1≥1.5 & L3≥2 & L6≥1.5 | 20 | 100.0 | +1.054 | 76.7% | ❌ n&lt;25 |

**Xác nhận D3 cũ:** L1≥1.5 & L6≥1.5 → **n=33, WR 90.91%** (khớp report trước).

**WR cao nhất vẫn n≥30:** L3≥2 & L6≥1.5 (96.7%, n=30) và L1≥1.5 & L3≥2 (91.4%, n=35).

---

## PHẦN 3 — Overfit IS 120d / OOS 60d (bắt buộc)

IS n≈71 · OOS n≈15 (theo thời gian entry). OOS base nhỏ → mọi “100% OOS” đều **thận trọng**.

| Đề xuất | IS n / WR | OOS n / WR | WR drop (IS−OOS) | Kết luận |
|---|---|---|---:|---|
| Baseline | 71 / 77.5% | 15 / 86.7% | −9.2 | Ổn định (OOS tốt hơn) |
| L1≥1.5 | 43 / 83.7% | 14 / 85.7% | −2.0 | **Ổn định** |
| L3≥2 | 39 / 84.6% | 13 / 92.3% | −7.7 | **Ổn định** |
| L6≥1.5 | 39 / 82.1% | 12 / 100% | −17.9 | Ổn định chiều IS→OOS nhưng OOS đẹp bất thường / n=12 |
| L1≥1.5 & L3≥1.5 | 30 / 86.7% | 12 / 91.7% | −5.0 | **Ổn định** |
| **L1≥1.5 & L3≥2** | **23 / 91.3%** | **12 / 91.7%** | **−0.4** | **Ổn định nhất (WR gần phẳng)** — IS n=23 hơi dưới 25 |
| L1≥1.5 & L6≥1.5 | 22 / 86.4% | 11 / 100% | −13.6 | OOS n nhỏ |
| L3≥2 & L6≥1.5 | 19 / 94.7% | 11 / 100% | −5.3 | IS n=19 **mẫu nhỏ** |
| Triple L1+L3+L6 | ≤23 / ≥95% | 10 / 100% | ~0 | **Loại — n&lt;25** |

**Không có đề xuất nào WR OOS rớt mạnh dưới IS** trên tập này.  
**Loại vì mẫu:** mọi tổ hợp n&lt;25 full-sample; cảnh báo IS n&lt;25 với L1&L3≥2 dù full n=35.

---

## PHẦN 4 — Đối chiếu constants / shared vs NEAR-only

### 4.1 So với “cấu hình hiện tại”

Hiện **không** có `L1_MIN_SCORE` / `L3_MIN_SCORE` / `L6_MIN_SCORE` trong SSOT.  
Hành vi hiện tại ≈ **gate ≥ 0** (chỉ cần layer chạy; mandatory không = floor điểm).

| Gate đề xuất | “Hiện tại” (hiệu dụng) | Đề xuất | Thay đổi |
|---|---|---|---|
| L1 min | 0 (cho phép 0/1/1.33) | **1.5** (= yêu cầu 2đ trên mẫu) | Thêm floor — **mới 100%** so với không floor |
| L3 min | 0 (entered đều ≥1) | **2** | Siết từ cho phép 1 / 1.5 → chỉ 2 |
| L6 min | 0 (cho phép 0/1) | **1.5** | Loại NEUTRAL (1đ) và 0đ |

**Không** đề xuất sửa `FUNDING_STATE_THRESHOLDS` % (0.01 / 0.005…) trong bước này — chưa có sweep trên funding thô, chỉ sweep trên **điểm L6 đã map**.

### 4.2 Shared vs NEAR-only

| Cách áp dụng | Ảnh hưởng BTC/SOL/BNB | Khuyến nghị |
|---|---|---|
| Sửa `scoreL1V4` / `scoreL3V4` / `FUNDING_STATE_THRESHOLDS` / `SHORT_L6_BY_STATE` | **Có — shared** | ❌ Không làm khi chưa có BT đa symbol |
| Thêm **NEAR-only** `minLayerScore: { l1:1.5, l3:2, l6:1.5 }` trong gate `canEnter` / symbol override | Không nếu đúng namespace | ✅ Hướng đúng khi duyệt |
| Soft filter UI / cảnh báo (không hard-block) | Không | ✅ An toàn nhất để live 1 tháng |

---

## PHẦN 5 — Đề xuất cuối (xếp tin cậy)

Khoảng tin cậy thô (rule of thumb): ±√(p(1−p)/n) × 100 (pp).

| Ưu tiên | Đề xuất | n / WR / EV (full) | 95%-ish WR band thô | Δ tần suất | Overfit | Áp dụng? |
|---|---|---|---|---|---|---|
| **P0** | **Giữ nguyên** (baseline) | 86 / 79.1% / +0.55 | ~70–87% | 0% | Thấp | Live OK — mục tiêu 70% đã đạt |
| **P1** | NEAR-only soft/hard: **L1≥1.5** | 57 / 84.2% / +0.67 | ~74–94% | −34% | Thấp (OOS ổn) | Có thể cân nhắc |
| **P2** | NEAR-only: **L3≥2** | 52 / 86.5% / +0.77 | ~76–97% | −40% | Thấp | Có thể cân nhắc |
| **P3** | NEAR-only: **L1≥1.5 & L3≥2** | 35 / 91.4% / +0.90 | ~80–100%* | −59% | Thấp–TB (IS n=23) | Chỉ soft hoặc chờ thêm data |
| **P4** | NEAR-only: **L6≥1.5** | 51 / 86.3% / +0.67 | ~75–97% | −41% | TB (OOS 100% / n=12) | Thận trọng |
| **P5** | L3≥2 & L6≥1.5 | 30 / 96.7% / +0.95 | hẹp giả tạo | −65% | TB–Cao (IS n=19) | **Chưa** hard-block |
| **P6** | Triple L1+L3+L6 | ≤23 / ≥95% | — | ≤−73% | Cao mẫu nhỏ | **Loại hard** |

\*Band hẹp khi n nhỏ dễ lạc quan — không đọc như cam kết 91%.

### Khuyến nghị vận hành

1. **Mặc định đề xuất: P0** — không đổi constants; baseline đã >70% WR.  
2. Nếu muốn siết NEAR: bắt đầu **P1 hoặc P2** dạng **soft / NEAR-only gate**, không đụng BTC/SOL/BNB.  
3. **P3** chỉ sau khi có thêm sample hoặc chạy soft song song.  
4. **Không** sửa shared `FUNDING_STATE_THRESHOLDS` / EMA-MACD formulas cho đến khi có BT đa coin + duyệt riêng.  
5. Nhắc: toàn SHORT 180d — mọi số liệu trên **không chứng minh** LONG.

### Checklist duyệt

| ID | Duyệt soft NEAR-only? | Duyệt hard-block NEAR-only? | Sửa shared constants? |
|---|---|---|---|
| P0 giữ nguyên | — | — | ❌ |
| P1 L1≥1.5 | ⬜ | ⬜ | ❌ |
| P2 L3≥2 | ⬜ | ⬜ | ❌ |
| P3 L1+L3 | ⬜ | ⬜ (không khuyến nghị hard ngay) | ❌ |
| P4 L6≥1.5 | ⬜ | ⬜ | ❌ |

---

**Chờ duyệt trước khi viết bất kỳ code/constants nào.**
