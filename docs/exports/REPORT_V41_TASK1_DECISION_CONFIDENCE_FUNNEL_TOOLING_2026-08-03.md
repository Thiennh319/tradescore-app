# REPORT — Task 1: Tooling Decision Confidence funnel (V4.1)

**Date:** 2026-08-03  
**Scope:** Chuẩn bị / sửa **script backtest** only. **Không** đổi `decisionConfig` thresholds; **không** chạy sweep 180d × 4 coin.  
**Script:** `scripts/backtest-v41-near-pipeline-funnel.ts` (giữ tên file; generic đa coin)

---

## 1. Trạng thái script trước khi sửa

| Hạng mục | Trước | Vấn đề |
|----------|-------|--------|
| Chạy được? | Có khung fetch + pipeline | Phụ thuộc `FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR` (ép continuous NEAR) — lệch path RC3 production binary |
| CSV kết quả | Không có artefact | Chưa từng dump bền vững trên disk |
| Phạm vi bar | Chỉ ghi khi TR ACTIVE (`if (!stageTr) continue`) | **Không** đủ histogram Decision Confidence mọi bar |
| Confidence cột | 1 cột `confidence` chỉ khi qua momentum | Không tách `confTR` vs `finalConfidence` |
| Coin | Hard-code NEAR | Không `--symbol` |
| Days | Hard-code 30 | Không `--days` |

**Kết luận:** Script tồn tại nhưng **chưa sẵn sàng** đo Decision ≥75 theo yêu cầu. Cần generic hóa + dump đủ cột.

---

## 2. Đã làm (tooling only)

### CLI

```text
npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-near-pipeline-funnel.ts --symbol BNB --days 7
npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-near-pipeline-funnel.ts --symbol NEAR --days 180 --csv docs/exports/v41-decision-funnel-NEAR-180d.csv
```

- `--symbol` BTC|SOL|BNB|NEAR (hoặc *USDT)
- `--days` N (default **14**)
- `--csv` path (default `docs/exports/v41-decision-funnel-{SYM}-{days}d.csv`)

### Path engine (khớp RC3)

`evaluateTrendReversalWithContext` → `computeConfidenceEngineResult` → `computeDecisionEngineResult`  
(+ EW / Momentum / `isEligibleForDirection` trên **mọi** 1H bar sau warmup — không ép continuous flag).

### Cột CSV mỗi bar (33 cột)

`symbol, openTime, iso, trendDirection, proposedSide,`  
`confTR, finalConfidence, decision, trendReversalConfirmed,`  
`trState, preContextState, trActive, contextApplied, contextPass,`  
`ctxBtc, ctxFunding, ctxOi, ctxWhale, ctxVolatility,`  
`ewSeverity, ewPass, momentumLong, momentumShort, momentumPass,`  
`eligible, hardBlocks, activeConditionCount, completenessMultiplier, proposedDirection,`  
`bandLt45, band45to75, bandGe75, finalPropose`

Summary cuối file: phân phối band `<45` / `[45,75)` / `≥75`, LONG|SHORT, trActive, eligible.

---

## 3. Smoke test (đúng yêu cầu Task 1)

| | |
|--|--|
| Lệnh | `--symbol BNB --days 7` |
| Kết quả | **OK** (exit 0) |
| CSV | `docs/exports/v41-funnel-smoke-BNB-7d.csv` |
| Bars | 167 (1H sau warmup) |
| Data fetch | BNB 1h=387, 30m=555, 4h=121; BTC 1h/4h OK; funding live OK |

Tóm tắt smoke (chỉ để verify format — **không** phải kết luận 180d):

| Band / metric | n | % |
|---------------|--:|--:|
| finalConfidence < 45 | 166 | 99.40% |
| 45 ≤ conf < 75 | 1 | 0.60% |
| ≥ 75 | 0 | 0.00% |
| Decision LONG\|SHORT | 0 | 0% |
| trActive | 1 | — |

Cột `finalConfidence` có giá trị số (vd 19.125, 12.909375, 7.875) — đúng Decision Confidence, không nhầm confTR.

---

## 4. Sẵn sàng đo 4 coin × 180 ngày chưa?

**Có — tooling sẵn sàng.** Cách chạy đề xuất (Task sau, không chạy trong Task 1):

```text
# lần lượt hoặc parallel có kiểm soát rate-limit
--symbol BTC --days 180
--symbol SOL --days 180
--symbol BNB --days 180
--symbol NEAR --days 180
```

Ước lượng thô: mỗi coin ~ vài phút–15 phút (fetch klines + ~1000+ bar evaluate; `FETCH_GAP_MS=250`).

### Vướng mắc / giới hạn (không chặn smoke; cần biết khi sweep)

| Vướng | Chi tiết |
|-------|----------|
| Funding lịch sử | Script dùng **premiumIndex hiện tại** 1 lần cho cả cửa sổ — không series funding theo bar |
| OI / Whale | Thường `SKIP` / `NA` nếu không inject lịch sử → context dims không đầy đủ như live có đủ input |
| Clock | Dump theo **1H** (dense); RC3 scan on-demand — tỷ lệ thời gian vẫn dùng được cho histogram confidence |
| API Binance | Rate limit / mạng; đã có sleep 250ms; 4×180d tuần tự an toàn hơn parallel ồ ạt |
| CSV lớn | ~1000–1200 bar/coin/180d × 33 cột — ổn |

### Phục hồi cây `services/v41` (ngoài phạm vi “chỉ script”, bắt buộc để chạy)

Trong lúc smoke, phát hiện nhiều file V4.1 trên disk **bị trống 0–2 byte** (kể cả `reversalDetector.ts`, `decisionEngine.ts`, foundation…). Đã:

- Khôi phục `config/featureFlags.ts` từ `git HEAD`
- Viết lại `decisionConfig.ts` / `decisionEngine.ts` đúng nội dung đã audit trước (thresholds **giữ 75/45/25** — không đổi ngưỡng)
- Khôi phục các module trống khác từ **Cursor Local History** (bản gần nhất size >1KB)

**Không** đụng logic ngưỡng Decision. Nếu làm việc tiếp trên máy này: nên `git status` kiểm tra các file restore và giữ chúng khỏi bị wipe lại.

---

## 5. Trả lời checklist Task 1

1. Script cũ: tồn tại, **chưa** đủ / lệch continuous NEAR-only → **đã sửa**.
2. Generic 4 coin: **có** (`--symbol`).
3. Dump đủ field yêu cầu: **có** (kèm band helper ≥75).
4. Smoke ngắn 1 coin: **BNB 7d OK**.
5. Sẵn sàng 4×180d: **có**, với hạn chế funding/OI/whale lịch sử nêu trên.

**Không** chạy sweep / **không** đề xuất đổi ngưỡng trong task này.

---

## Artefacts

- `scripts/backtest-v41-near-pipeline-funnel.ts` (genericized)
- `docs/exports/v41-funnel-smoke-BNB-7d.csv`
- `docs/exports/_v41-funnel-smoke.log`
- Report này
