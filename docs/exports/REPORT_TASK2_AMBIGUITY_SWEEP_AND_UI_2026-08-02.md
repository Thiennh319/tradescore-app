# TASK 2/3 — Sweep ambiguity + điều tra nút LONG/SHORT UI

**Ngày:** 2026-08-02  
**Phạm vi:** CHỈ đo lường + điều tra — **không sửa code**, không Task 3 kiến trúc.  
**Trạng thái Phần A:** **BLOCKED** (thiếu tooling nhất quán) — không có bảng sweep đủ 4 coin.  
**Trạng thái Phần B:** **DONE** (điều tra UI + phương án, chưa chọn).

---

## PHẦN A — Sweep ngưỡng ambiguity

### A.0 Gap tooling (bắt buộc đọc trước số liệu)

| Coin | Script V4 BT sẵn? | Wire `resolveDirectionAmbiguity`? | Kết luận đo sweep |
|------|-------------------|-----------------------------------|-------------------|
| **NEAR** | Có — `scripts/backtest-v4-near-90d.ts` (SYMBOL hardcode `NEARUSDT`) | **Không** — entry chỉ `suggestDirectionV4` + `canEnterV4` (~1133–1135) | **Không đo được** threshold 1.0/1.5/… đúng cơ chế live |
| **BTC** | **Không** có `backtest-v4-btc-*.ts` / generic multi-symbol V4 | — | **Thiếu công cụ** |
| **SOL** | **Không** | — | **Thiếu công cụ** |
| **BNB** | **Không** | — | **Thiếu công cụ** |

**Có sẵn nhưng KHÔNG dùng cho Task này (engine khác):** các `scripts/backtest-v41-*` (breakout / continuous) — không đồng nhất với V4 RuleBook + ambiguity Group-score.

**CSV trade hiện có** (`near_backtest_180d_cvd220_s1.csv`): chỉ có `score` của **hướng active**, **không** có `longScore`/`shortScore`/`scoreDiff` → **không** post-filter theo `|Δ|` một cách nhất quán với live (thiếu cả hysteresis 2-scan).

Theo yêu cầu Task 2: *không tự chế cách đo khác không nhất quán* → **không** fork script tạm, **không** ước lượng ambiguity từ CSV một phía, **không** lấy V4.1 làm proxy.

### A.1 Vì sao “threshold=1.0 hiện tại” trên BT ≠ live

Live (`signalBoardScan.ts` ~1114–1143):

1. Tính `longScoreV4` / `shortScoreV4` = `officialTotalScore ?? referenceTotalScore`
2. `resolveDirectionAmbiguity(long, short, prev)` với `AMBIGUOUS_THRESHOLD = 1.0`
3. Sau 2 scan `|Δ| < 1` → `applyAmbiguityToSnapshot` → `canEnter: false`

BT (`backtest-v4-near-90d.ts`): **bỏ qua** bước 2–3. Baseline S1 trên CSV = **S1 L3 gate + không ambiguity**.

→ Mọi con số “n/tháng @ threshold=X” từ BT hiện tại sẽ **sai lệch live** nếu gán nhãn threshold=1.0.

### A.2 Baseline NEAR (tham chiếu — **không** phải sweep ambiguity)

**Nguồn:** `docs/exports/near_backtest_180d_cvd220_s1.csv`  
**Baseline ghi rõ:** CVD rolling 220 + **gate S1 NEAR SHORT L3≥1.5** (sau implement), **không** có ambiguity filter.  
**EV** = mean `resultR` (expectancy R), khớp convention báo cáo S1 trước.

| Scope | n | n/tháng (180d÷6) | WR% | EV (R) |
|-------|--:|------------------:|----:|-------:|
| ALL | 173 | 28.83 | 75.14 | +0.436 |
| LONG | 29 | 4.83 | 68.97 | +0.381 |
| SHORT | 144 | 24.00 | 76.39 | +0.447 |

IS/OOS trên **cùng baseline không-ambiguity** (cắt theo thời gian 120d/60d trên sample trades):

| Split | n | WR% | EV (R) |
|-------|--:|----:|-------:|
| IS ~120d | 113 | 74.34 | +0.399 |
| OOS ~60d | 60 | 76.67 | +0.505 |

→ OOS không sập WR trên baseline S1 **không-ambiguity** (chỉ sanity của baseline hiện có, **không** validate threshold ambiguity).

### A.3 Bảng sweep yêu cầu — trạng thái

| Coin | Thr 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | % mất vs 1.0 | IS/OOS best |
|------|---------|-----|-----|-----|-----|--------------|-------------|
| BTC | — | — | — | — | — | **N/A — thiếu BT V4** | N/A |
| SOL | — | — | — | — | — | **N/A** | N/A |
| BNB | — | — | — | — | — | **N/A** | N/A |
| NEAR | — | — | — | — | — | **N/A — BT chưa wire ambiguity** | N/A |

### A.4 Việc cần duyệt trước khi đo lại (Task 3 / tooling — chưa làm)

1. Mở rộng runner V4: `--symbol` (BTC/SOL/BNB/NEAR) **hoặc** 4 script clone nhất quán từ `backtest-v4-near-90d.ts`.
2. Wire ambiguity vào loop BT: gọi `resolveDirectionAmbiguity` + hysteresis state per bar; reject entry khi `AMBIGUOUS` (giống `applyAmbiguityToSnapshot`).
3. Parametrize threshold (1.0…3.0) hoặc sweep ngoài; CSV thêm `longScore,shortScore,scoreDiff,ambiguityStatus`.
4. NEAR: luôn chạy trên nền **S1** (code gate đã có trong `scorerV4` / `nearV4LayerGates`).

**Không** đề xuất giá trị threshold ở Task này (thiếu số).

---

## PHẦN B — Nút LONG/SHORT UI

### B.1 Chỗ tính ready (trích dẫn)

**Định nghĩa** — `components/dashboard/SignalBoard.tsx`:

```590:598:components/dashboard/SignalBoard.tsx
function isDirectionReady(
  direction: TradeDirection,
  snap: ReturnType<typeof resolveSignalRow>,
  row: SignalRow,
  blockReasons: string[],
): boolean {
  const score = direction === 'LONG' ? snap.longScore : snap.shortScore;
  return score >= 9 && !isDirectionBlocked(direction, row, snap, blockReasons);
}
```

**Dùng cho style nút** (~1332–1333, ~1442–1484):

- `longReady = isDirectionReady('LONG', …)`
- `shortReady = isDirectionReady('SHORT', …)`
- Style: `directionBtnLongReady` / `directionBtnShortReady` vs `Idle`

**Modal `canEnter`** (~1520–1526):  
`longSnapshot?.canEnter ?? isDirectionReady(...)` (tương tự SHORT).  
Path board thường **không** có `longSnapshot` → fallback = `isDirectionReady` độc lập.

**Highlight số điểm** (~1336–1339): `longScoreActive` cần `longSnapshot?.canEnter === true` — thường **false** trên board V4 thường.

**LayerCard:** không tính ready hướng; chỉ layers (+ optional `strongL3Label`).

**TradePlanModal:** nhận `canEnter` từ parent; case A xác nhận / case B “chưa đủ”; `resolvePlan` chỉ trả plan nếu `plan.direction === direction` modal.

### B.2 Ba phương án UI (chưa chọn)

| # | Phương án | Ưu | Nhược |
|---|-----------|----|-------|
| **U1** | Chỉ nút `snap.direction` (từ `suggestDirectionV4`) ở trạng thái ready; nút kia **disabled/mờ**, không mở modal enter | Khớp SSOT 1 hướng; ít nhầm; sửa hẹp | Mất khả năng xem kế hoạch chiều phụ; user không “đảo tay” nhanh |
| **U2** | Giữ 2 nút bấm được; chiều official = **ready/primary**; chiều kia = nhãn rõ (“không khuyến nghị” / secondary), `canEnter` modal = false hoặc case B | Vẫn xem score/plan phụ; giảm hiểu nhầm “cả hai vào được” | Copy/UI phức tạp hơn; cần định nghĩa plan chiều phụ |
| **U3** | Gate UI bằng ambiguity + hướng: ready chỉ khi `!isAmbiguous && direction===side && isDirectionReady(side)`; chiều kia luôn idle | Tận dụng flag ambiguity đã có; gần live `canEnter` | Ambiguous → cả hai mờ (có thể đúng); vẫn cần quyết định U1 vs U2 khi CLEAR nhưng cả hai score≥9 |

Task 3 sẽ chọn U* cùng ngưỡng ambiguity.

### B.3 Phạm vi ảnh hưởng nếu sửa UI

| Path | Ảnh hưởng? |
|------|------------|
| **SignalBoard.tsx** (nút + `canEnter` prop modal) | **Có — primary** |
| **TradePlanModal.tsx** | Gián tiếp (prop `canEnter` / UX case A vs B); logic nội tại có thể giữ |
| **LayerCard** | Không (trừ copy phụ) |
| **signalBoardScan / suggestDirection / ambiguity** | Không bắt buộc cho chỉ-sửa-UI; Task 3 có thể đụng nếu siết SSOT |
| **scanUnified / unifiedSignalEngine** (`longSnapshot` độc lập, ưu tiên LONG) | **Có thể lệch** nếu chỉ sửa SignalBoard — nên review khi Task 3 |
| **SignalBoardUnified / V41 boards** | Path riêng; ngoài phạm vi V4 board trừ khi unify |
| **Trade plan / Trace export (01–05)** | Copy `direction` + hard state từ snapshot — **không** phụ thuộc style nút; không đổi nếu chỉ sửa ready UI |
| **Backtest scripts** | Không |
| **useTradeStore `selectedDirection`** | Không trừ khi đổi cách user mở lệnh từ board |

---

## Kết luận chờ duyệt

1. **Phần A không hoàn thành được số sweep** vì thiếu BT V4 multi-coin + NEAR BT chưa wire ambiguity.  
2. Baseline NEAR S1 (không ambiguity) đã ghi để neo Task 3 tooling.  
3. **Phần B đủ** để Task 3 chọn U1/U2/U3 cùng thiết kế ngưỡng.  

**Chờ duyệt:** có cho phép (a) generic hóa `backtest-v4-near-90d.ts` + (b) wire ambiguity + sweep threshold — rồi mới chạy lại Phần A đầy đủ trước/kèm Task 3 kiến trúc không?
