# REPORT — V4 Multi-symbol archive expansion (NEAR + BTC + SOL + BNB)

**Date:** 2026-07-31  
**Scope:** Phương án C forward archive only — **không** đụng V4.1 / scorerV4 / tradePlanV4  
**Repo target (sau khi bạn duyệt):** `tradescore-app` workflow *Archive OI/LS funding*  
**Push/merge:** **chưa làm** — chỉ sửa local, chờ review

---

## 1. Quyết định cấu trúc lưu trữ — **Cách B**

| | Cách A (1 file chung + cột symbol) | Cách B (1 file / symbol) |
|---|---|---|
| Ưu | Một chỗ query; `git add` 1 path | **NEAR cũ không đụng schema/migrate**; diff git theo coin; lỗi/ghi file độc lập |
| Nhược | Phải migrate/đổi tên `nearusdt_1h.csv` → rủi ro mất/trộn lịch sử; conflict merge lớn hơn | 4 file thay vì 1 |

**Chọn B:** giữ nguyên `data/market-archive/nearusdt_1h.csv`, thêm:

- `btcusdt_1h.csv`
- `solusdt_1h.csv`
- `bnbusdt_1h.csv`

Smoke-test xác nhận dòng đầu NEAR vẫn là `2026-07-28T00:00:00.000Z` (dữ liệu cũ không mất).

---

## 2. File đã sửa / tạo (local)

| File | Thao tác |
|------|----------|
| `scripts/archive-oi-ls-funding.ts` | Multi-symbol loop; CSV path theo symbol; isolate lỗi từng coin |
| `scripts/check-market-archive-progress.ts` | `--symbol`; mặc định tổng hợp 4 symbol |
| `.github/workflows/archive-oi-ls-funding.yml` | `git add data/market-archive/*.csv`; tên workflow multi; commit message cập nhật |
| `data/market-archive/README.md` | Mô tả 4 symbol + Cách B + lệnh check |
| `data/market-archive/btcusdt_1h.csv` | **Tạo** (smoke-test) |
| `data/market-archive/solusdt_1h.csv` | **Tạo** (smoke-test) |
| `data/market-archive/bnbusdt_1h.csv` | **Tạo** (smoke-test) |
| `data/market-archive/nearusdt_1h.csv` | **Cập nhật** heal/forward (giữ history cũ) |
| `docs/REPORT_V4_MULTI_SYMBOL_ARCHIVE_EXPANSION_2026-07-31.md` | Báo cáo này |

**Không đổi:** cadence cron `0 * * * *`, `workflow_dispatch`, `permissions: contents: write`, `concurrency.cancel-in-progress: false` (group vẫn `archive-oi-ls-near` để tránh song song với job cũ).

---

## 3. Smoke-test local (`npx tsx scripts/archive-oi-ls-funding.ts`)

| Symbol | rows sau chạy | File bytes | Lỗi fatal? |
|--------|---------------|------------|------------|
| NEARUSDT | 50 (trước ~25 data rows; heal mở rộng span) | 5934 | Không |
| BTCUSDT | 25 | 3048 | Không |
| SOLUSDT | 25 | 3047 | Không |
| BNBUSDT | 25 | 3021 | Không |

- Exit code **0**
- Tổng 4 file: **~14.7 KB**
- NEAR first row cũ **giữ nguyên**

---

## 4. Ước tính dung lượng (không đáng lo GitHub)

Giả sử ~**130 bytes/dòng** (đo thực tế ~120–140).

| Horizon | Rows / symbol | Rows × 4 | Size ước tính |
|---------|---------------|----------|---------------|
| 90 ngày | 2 160 | 8 640 | **~1.1 MB** |
| 365 ngày | 8 760 | 35 040 | **~4.5 MB** |
| 5 năm | 43 800 | 175 200 | **~22 MB** |
| 10 năm | 87 600 | 350 400 | **~45 MB** |

→ Vẫn rất nhỏ so với giới hạn practical của GitHub repo / Actions artifact; **không có rủi ro “báo đầy”** ở quy mô archive 1h OI/LS/funding.

---

## 5. Cách dùng progress check

```bash
# Tổng hợp 4 symbol
npx tsx scripts/check-market-archive-progress.ts

# Một coin
npx tsx scripts/check-market-archive-progress.ts --symbol BTCUSDT
```

---

## 6. Việc bạn cần làm sau khi duyệt

1. Review diff local (đặc biệt `nearusdt_1h.csv` vẫn chứa history cũ).
2. Commit + push lên default branch của `tradescore-app` **không đúng phút :00 UTC** nếu muốn tránh trùng cron.
3. Chạy tay `workflow_dispatch` 1 lần → xác nhận Actions commit cả 4 CSV.
4. Để cron tiếp tục.

**Agent không push/merge trong task này.**

---

## 7. Ràng buộc đã giữ

- Không V4.1 / không `runAdvancedBacktest` / không sửa `scorerV4` / `tradePlanV4`
- Không dependency mới / không API key — chỉ Binance public endpoints sẵn có
