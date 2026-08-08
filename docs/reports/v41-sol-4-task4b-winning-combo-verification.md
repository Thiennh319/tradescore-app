# V41-SOL-4 Task 4b — Winning combo trade-level + true OOS

**Ngày:** 2026-08-08  
**Combo:** `retest_band_pct=0.003`, `tp1_rr=1.2`, còn lại NEAR default + `dedupeByBrokenLevel`  
**IS window (pin):** 2025-08-08 → 2026-08-08  
**Artefacts:**  
- `docs/exports/v41-sol-4-winning-combo-trades.csv` (n=36)  
- `docs/exports/v41-sol-4-task4b-dropped-trades.json`  
- `docs/exports/v41-sol-4-winning-combo-oos-prior365d-trades.csv`  
- `docs/exports/v41-sol-4-winning-combo-oos-prior365d-summary.json`  
- Script: `scripts/verify-v41-sol-4-winning-combo.ts`

---

## 1. Diff vs Task 3 clean (n=40 → n=36)

Không phải “mất đúng 4 lệnh nguyên vẹn”: **drop 5 + add 1** → net −4. Khớp observation quý (Q1 −2, Q4 −2; Q2 đổi identity nhưng giữ n).

### 5 lệnh có trong baseline, không còn (cùng `active_open_time`)

| # | active_iso (UTC) | Q | Side | outcome | net_r (baseline RR=1.5) | Cơ chế lọc |
|--:|------------------|---|------|---------|------------------------:|------------|
| 1 | 2025-09-08 10:00 | 1 | LONG | **TP** | **+1.447** | Closest retest **0.411%** từ level → trong ±0.5%, **ngoài ±0.3%** |
| 2 | 2025-09-15 08:00 | 1 | SHORT | **SL** | **−1.043** | Closest **0.397%** → ngoài ±0.3% |
| 3 | 2026-01-20 07:00 | 2 | SHORT | **TP** | **+1.416** | Closest **0.476%** → ngoài ±0.3% |
| 4 | 2026-05-10 09:00 | 4 | LONG | **SL** | **−1.165** | Band chặt làm **retest bar trễ hơn**; bar mới không còn thành setup active (momentum/gate sau shift) → biến mất hẳn |
| 5 | 2026-06-24 17:00 | 4 | SHORT | **SL** | **−1.038** | Tương tự: retest index dịch (005→003); setup không còn trong danh sách winner |

Σ net_r các lệnh bị drop (theo baseline): **−0.383** (2 TP + 3 SL — không phải “chỉ lọc thua”).

### 1 lệnh mới xuất hiện

| active_iso | Q | Side | outcome | net_r (RR=1.2) | Giải thích |
|------------|---|------|---------|----------------:|------------|
| 2026-01-20 08:00 | 2 | SHORT | **TP** | **+1.122** | Khi 07:00 không còn confirm (band 0.3%), setup cascade/cạnh 08:00 trở thành **head** (trước đó bị occupancy dedupe đứng sau 07:00) |

→ Band chặt hơn **không chỉ “cắt bớt”**: còn **đổi thứ tự confirm** trong cùng đợt, nên identity trade Q2 đổi (07:00→08:00).

---

## 2. Cơ chế `retest_band_pct=0.003`

Confirm-B cần nến sau breakout **chạm** level Donchian bị phá trong band `level×(1±band)`.

- Baseline: band ±**0.5%**  
- Winner: band ±**0.3%**

Ba lệnh #1–#3: khoảng cách wick gần nhất tới level nằm **~0.40–0.48%** → đạt band cũ, fail band mới → **không confirm**. Đây là đúng theo thiết kế filter chặt hơn.

Hai lệnh #4–#5: vẫn có touch trong 0.3% ở **bar muộn hơn**; path emit thay đổi và **không** giữ được trade tương đương `active_open_time` baseline (không có thay thế gần May-10 / Jun-24 trong winner CSV).

`tp1_rr=1.2` **không** quyết định việc có/không emit setup (chỉ đổi kích thước TP / gross_r trên lệnh còn lại).

---

## 3. Cluster-check (IS winner)

Trên `v41-sol-4-winning-combo-trades.csv`:

| Metric | Value |
|--------|------:|
| cluster_n (same-side ≤6h) | **0** |
| cluster_trade_n | **0** |

→ Không sót duplicate kiểu Task 1 trên cửa sổ IS.

---

## 4. True OOS — 365d trước window chọn param

| | Winner (0.003 / RR1.2) | Baseline clean params (0.005 / RR1.5) trên cùng OOS |
|--|-----------------------:|--------------------------------------------------:|
| Window | **2024-08-08 → 2025-08-08** | cùng |
| n | 27 | 29 |
| WR% | **44.44** | 35.71 |
| E[R] after | **−0.1114** | −0.1948 |
| cluster_n | **2** (4 trades) | (không gate lại) |

OOS clusters winner:

1. 2024-12-01 00:00 SHORT TP + 02:00 SHORT SL (cách 2h)  
2. 2025-06-20 15:00 & 17:00 SHORT TP×2 (cách 2h)

→ Metric cluster ≤6h bắt cả **re-entry sau khi lệnh trước đã đóng** (xem §7). Đây **không** chứng minh dedupe tắt trên OOS.

**Đọc kết quả OOS:** combo thắng sweep vẫn **âm** trên năm trước; tốt hơn baseline cùng năm (−0.11 vs −0.19) nhưng **không** validate edge dương out-of-sample. H1/H2 trong Task 4 chỉ là split trong-sample của đúng 365d đã dùng để pick param — không thay thế OOS này.

---

## 5. Kết luận cho Task 5 (production / report cuối)

| Câu hỏi | Trả lời |
|---------|---------|
| IS có “đẹp” thật không? | Có: lọc chủ yếu touch mơ hồ 0.3–0.5%; WR/E[R]↑ trên 2025-08→2026-08; IS cluster=0 |
| Có phải chỉ cắt thua? | **Không** — cắt cả 2 TP mạnh (+1.45, +1.42); may mắn net set-change và RR thấp hơn vẫn kéo E[R]↑ in-sample |
| True OOS? | **Có data & đã chạy**; E[R] **âm** |
| Đưa production? | **Chỉ với disclaimer mạnh** — candidate research, **chưa** đủ bằng chứng ổn định đa niên. Task 5 nên: (a) giữ NEAR default sạch + dedupe làm floor an toàn, hoặc (b) ghi SOL combo 0.003/1.2 là **experimental**. |

**Khuyến nghị Task 5:** không promote param thắng sweep thành production SSOT chỉ dựa trên IS; dẫn chứng OOS 2024→2025 trong report cuối.

---

## 6. Cơ chế WR tăng (Task 4c)

Common set theo `active_open_time`: **35** lệnh (không phải 32 — net 40−5+1=36, giao với baseline theo identity = 35).

### Phân rã WR

| Bước | Wins / n | WR% |
|------|----------|----:|
| Baseline full | 19 / 40 | 47.50 |
| Chỉ bỏ 5 dropped (còn 35) | 17 / 35 | 48.57 |
| Sau 3 flip SL→TP trên common (RR 1.5→1.2) | 20 / 35 | 57.14 |
| + 1 lệnh added (TP) | 21 / 36 | **58.33** |

→ **WR tăng chủ yếu do `TP1_RR` 1.5→1.2** (3 lệnh chung đổi SL→TP: +8.57 pp trên common). Composition dropped/added thêm ~+1.2 pp đến full 58.33%. Band 0.003 chủ yếu đổi **tập lệnh**, không phải engine của WR jump.

### Các lệnh common đổi outcome SL → TP

| active_iso (UTC) | Side | outcome cũ (RR1.5) | net_r cũ | outcome mới (RR1.2) | net_r mới |
|------------------|------|--------------------|----------:|---------------------|----------:|
| 2025-10-07 15:00 | SHORT | SL | −1.082 | **TP** | **+1.118** |
| 2025-11-06 16:00 | SHORT | SL | −1.069 | **TP** | **+1.131** |
| 2025-12-29 00:00 | LONG | SL | −1.085 | **TP** | **+1.115** |

Không có flip ngược TP→SL trên common. TP gần hơn (1.2×SL) chạm trước khi giá quét SL — đúng giả thuyết “đánh đổi R:R lấy win rate”.

---

## 7. Điều tra cluster OOS (Task 4c)

### Dedupe có bật không?

**Có.** `scripts/verify-v41-sol-4-winning-combo.ts` → `runWindow` luôn gọi:

```ts
dedupeByBrokenLevel: true,
maxHoldBarsForLevelDedupe: MAX_HOLD_1H, // 80
retestBandPct: bandPct, // 0.003 → levelTolerancePct dedupe = 0.003
```

Không phải sơ suất tắt dedupe → **không re-run OOS**; số liệu E[R] giữ nguyên.

| | E[R] sau phí OOS |
|--|------------------:|
| Combo mới | **−0.1114** (không đổi) |
| Baseline | **−0.1948** (không đổi) |

### Chi tiết 2 cụm (4 lệnh)

| Cụm | active_iso | Side | outcome | bars_held | net_r | broken level | Ghi chú |
|-----|------------|------|---------|----------:|------:|-------------:|---------|
| A1 | 2024-12-01 00:00 | SHORT | TP | **2** | +1.019 | 238.00 | |
| A2 | 2024-12-01 02:00 | SHORT | SL | 13 | −1.088 | 237.28 | level Δ **0.303%** (> tol 0.3%); mở đúng **+2h** sau A1 |
| B1 | 2025-06-20 15:00 | SHORT | TP | **2** | +1.110 | 144.21 | |
| B2 | 2025-06-20 17:00 | SHORT | TP | 28 | +1.154 | 142.26 | level Δ **1.35%**; mở **+2h** sau B1 |

### Nguyên nhân (không phải bug Task 1 tái phát)

1. **Occupancy-B** chỉ chặn khi lệnh đại diện **còn mở**. A1/B1 đều **TP sau 2 bar** → `exitOpenTime` ≈ active+2h → lệnh +2h **được phép** (level đã free).  
2. Level ID không khớp cascade Task 1: `breakoutOpenTime` không nối `prior.active`; Δ level ≥0.3% (với tol = band 0.003).  
3. Metric “same-side ≤6h” của Task 1 **rộng hơn** occupancy-B: bắt cả re-entry hợp lệ sau đóng lệnh trong 6h.

→ Cluster OOS = **re-entry sớm sau TP nhanh**, không phải multi-count cùng một sự kiện đang active. Muốn siết hơn cần cooldown-theo-side / min gap (ngoài phạm vi dedupe level hiện tại).

---

## 8. Kết luận cập nhật (sau 4c)

- Cơ chế WR IS: xác nhận **chủ yếu TP1_RR thấp hơn** (3× SL→TP), không phải “band chỉ lọc thua”.  
- Cluster OOS: **dedupe đã đúng**; không đổi số liệu OOS.  
- **Khuyến nghị production giữ nguyên:** cả hai config **âm trên OOS** → **không đủ cơ sở** đưa combo sweep vào production SSOT; dùng làm experimental kèm disclaimer + cân nhắc cooldown side nếu còn nghiên cứu residual ≤6h.
