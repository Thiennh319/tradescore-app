# V41-SOL-4 Task 2 — TR baseline có dính bug đếm trùng không?

**Ngày:** 2026-08-08  
**Input Task 1:** `docs/reports/v41-sol-4-task1-bugfix-summary.md`  
**Data:** `docs/exports/v41-sol-tr-365d-quarterly-trades.csv` (SOL-2, n=46)  
**Phạm vi:** chỉ kiểm tra / báo cáo — **không sửa** TR.

---

## Kết luận

**Có — bug kiến trúc tương tự (không deconflict), mức độ nhẹ hơn breakout Confirm-B trên SOL.**

| | Breakout Confirm-B (SOL-3, trước fix) | TR CVD-flip (SOL-2) |
|--|--------------------------------------|---------------------|
| Cơ chế | Scan mọi bar **1H**, emit Confirm-B độc lập / cascade Donchian | Mỗi clock **4H**: nếu gate ACTIVE → mở 1 trade, **không** cooldown |
| Anti-dup sẵn có | Không (đã fix Task 1 level-occupancy) | **Không** trong `detectCvdFlip` / `computeTrendReversal` / `resolveTrendReversalState` / script SOL-2 |
| Cụm same-side ≤6h | 5 cụm, 11/46 lệnh (24%), ~80% tổng R | **2 cụm**, **6/46 lệnh (13%)**, **55.3%** tổng net_r signed (âm) / **11.1%** abs R |
| Khoảng cách trong cụm | 1h | **4h** (đúng nhịp clock 4H) |

So sánh TR vs Breakout trước Task 1 **không hoàn toàn công bằng** nếu một bên đã/đang bị phóng đại bởi fan-out — nhưng TR **không** “sạch 100%”: vẫn có chuỗi ACTIVE liên tiếp trên cùng side khi điều kiện đảo chiều còn đúng qua nhiều nến 4H.

**Không tự ý sửa TR** ở Task 2 (baseline dùng chung nhiều report). Mọi fix cooldown/occupancy TR cần xác nhận phạm vi riêng.

---

## 1. Hàm sinh active signal TR

| Lớp | File / hàm | Vai trò |
|-----|------------|---------|
| CVD flip | `services/v41/reversalDetector.ts` → `detectCvdFlip` | Pattern 3 nến CVD theo chiều counter-trend |
| Gate ACTIVE | `resolveTrendReversalState` / `computeTrendReversal` | ≥`TREND_REVERSAL_ACTIVE_MIN_SIGNALS` + confidence ≥ min |
| Live RC3 | `buildRc3ViewModelFromRow` → `evaluateTrendReversalWithContext` | Một card “hiện tại” mỗi scan (không map chuỗi clock → trades) |
| Backtest SOL-2 | `scripts/backtest-v41-sol-tr-365d-quarterly.ts` | Loop **mọi** 4H clock; `gate && confidence≥min && side` → `trades.push` — **không** bỏ qua nếu vẫn còn lệnh mở cùng side |

Đoạn fan-out backtest (không cooldown):

```ts
// scripts/backtest-v41-sol-tr-365d-quarterly.ts ~391–401
for (const e of bars) {
  if (!e.gate || e.confidence < confMin || e.side == null) continue;
  // … computeCounterTrendSL → luôn thêm trade
}
```

`detectCvdFlip` chỉ trả boolean tại điểm cắt klines — không nhớ flip trước đó, không cooldown. Khác `trendFollowDetector` (có `isFirstTrendGateInCooldown`).

---

## 2. Thuật toán cụm (giống Task 1)

- Sort theo `timestamp` tăng dần  
- Cụm: cùng `side`, khoảng cách giữa các thành viên liên thông ≤ **6 giờ** (transitive)  
- Chỉ báo cụm có **n ≥ 2**

Nguồn: `docs/exports/v41-sol-tr-365d-quarterly-trades.csv`.

---

## 3. Cụm phát hiện được

| Cụm | Side | n | Gaps | Σ net_r (cụm) | Ghi chú |
|-----|------|--:|------|---------------|---------|
| 2026-02-05 12:00 → 02-06 00:00 | LONG | **4** | 4h, 4h, 4h | **−3.349** | Entry 84.55→81.63→78.29→76.66 (trượt xuống liên tục); 3×SL/BOTH held=1 + 1 TIMEOUT net_r n/a |
| 2026-05-16 08:00 → 12:00 | LONG | **2** | 4h | **−2.244** | Cả hai SL; lệnh đầu `bars_held=9` → lệnh 2 mở khi lệnh 1 **vẫn đang mở** |
| **Tổng 2 cụm** | | **6** | | **−5.593** | |

**SHORT:** 0 cụm ≤6h (min gap SHORT = 12h).

### Ảnh hưởng R

| Metric | Value |
|--------|------:|
| n_active tổng | 46 |
| Lệnh trong cụm | 6 (**13.0%**) |
| Tổng net_r năm | −10.121 |
| Σ net_r cụm | −5.593 (**55.3%** của tổng signed R — làm **âm hơn**) |
| Σ \|net_r\| cụm / Σ \|net_r\| | **11.1%** |
| Nếu chỉ giữ lệnh đầu mỗi cụm | Σ cụm −5.593 → **−2.229** (bớt ~−3.36 R “trùng”) |

---

## 4. Giống / khác bug Breakout

**Giống:** re-evaluate độc lập mỗi clock; điều kiện còn true → thêm lệnh cùng side trong lúc giá trôi một hướng; backtest đếm nhiều “opportunity” từ một giai đoạn.

**Khác:**
- Nhịp **4H** (không cascade 1H Donchian / `breakoutOpenTime === prior.activeOpenTime`).
- Ít cụm hơn (2 vs 5); 0 SHORT-cluster.
- Đóng góp abs R nhỏ hơn (~11% vs ~80% signed R phình trên breakout).
- Live TR card = snapshot hiện tại → vấn đề chủ yếu là **đếm backtest / baseline metrics**, không phải multi-card 1H.

---

## 5. Giới hạn kết luận

- Phân tích bám đúng file trades SOL-2 đã export; **không** re-run backtest.
- TIMEOUT có `net_r` trống → tính 0 trong Σ cụm (cụm Feb chỉ 3 lệnh có R).
- “≤6h” bắt cụm 4H; không bắt cặp cách 8–12h cùng side (có thể vẫn là một đợt BEAR kéo dài nhưng ngoài rule Task 1).

---

## 6. Khuyến nghị (không làm ở Task 2)

Nếu sau này chỉnh TR baseline cho so sánh công bằng với breakout đã dedupe: xem xét occupancy / cooldown theo side (hoặc “một ACTIVE mỗi chuỗi clock liên tiếp”) — **cần task riêng + xác nhận phạm vi** trước khi đụng SSOT production.
