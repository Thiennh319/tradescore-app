# Market archive — OI / L/S / funding (forward)

**Phương án C** — tự lưu điểm 1h để sau này backtest 90d+ không phụ thuộc trần Binance ~30 ngày.

## Scope

| | |
|---|---|
| Symbols | **NEARUSDT**, **BTCUSDT**, **SOLUSDT**, **BNBUSDT** |
| Cadence | 1 điểm / giờ / symbol (UTC bar open) |
| Trigger | GitHub Actions — `.github/workflows/archive-oi-ls-funding.yml` |
| Storage | **1 CSV / symbol** (Cách B — file tách riêng) |

### File CSV

| Symbol | Path |
|--------|------|
| NEARUSDT | `nearusdt_1h.csv` (giữ nguyên — dữ liệu cũ không migrate) |
| BTCUSDT | `btcusdt_1h.csv` |
| SOLUSDT | `solusdt_1h.csv` |
| BNBUSDT | `bnbusdt_1h.csv` |

Mỗi symbol lỗi API không làm hỏng symbol khác (collector xử lý độc lập từng coin).

## Schema CSV

```text
timestamp,timestamp_iso,symbol,oi,ls_top_ratio,ls_global_ratio,funding_rate,source,status,error,collected_at
```

| Field | Ý nghĩa |
|---|---|
| `timestamp` | ms UTC, đầu giờ bar 1h |
| `oi` | Open interest (`sumOpenInterest`) |
| `ls_top_ratio` | Top trader account long/short ratio |
| `ls_global_ratio` | Reserved (phase 1 thường để trống) |
| `funding_rate` | Binance funding (decimal, chưa ×100) |
| `source` | `forward_archive` (giờ hiện tại) hoặc `api_heal_24h` (vá gap) |
| `status` | `ok` \| `partial` \| `error` |
| `error` | Chi tiết thiếu field / lỗi API |
| `collected_at` | Wall-clock lúc job chạy |

## Endpoints (public, không API key)

- `GET /futures/data/openInterestHist`
- `GET /futures/data/topLongShortAccountRatio`
- `GET /fapi/v1/fundingRate`

Collector: `scripts/archive-oi-ls-funding.ts` (raw `fetch`, không qua AsyncStorage).

## GitHub Actions

- Workflow: `archive-oi-ls-funding.yml` (name: *Archive OI/LS funding (multi)*)
- Cron: `0 * * * *` (mỗi giờ UTC) + `workflow_dispatch` (chạy tay)
- Sau mỗi lần chạy: nếu CSV đổi → `git add data/market-archive/*.csv` → commit + push
- **`schedule` chỉ chạy trên default branch**

Repo **public** → Actions schedule + phút thường không bị giới hạn như private Free.

## Kiểm tra tiến độ

Tất cả 4 symbol (tóm tắt):

```bash
npx tsx scripts/check-market-archive-progress.ts
```

Một symbol:

```bash
npx tsx scripts/check-market-archive-progress.ts --symbol BTCUSDT
npx tsx scripts/check-market-archive-progress.ts --symbol NEARUSDT
```

In ra: `span_days`, `coverage_pct`, `gap_list`, `ready_90d` (mặc định ≥90 ngày và coverage ≥95%).

## Chạy collector thủ công (local)

```bash
npx tsx scripts/archive-oi-ls-funding.ts
```

Thu thập song song tuần tự cả 4 symbol vào 4 file CSV tương ứng.

## Heal gap

Mỗi lần chạy, mỗi symbol merge thêm ~24h OI/LS hist gần nhất để vá nếu 1 lần Action bị skip/fail.

## Dung lượng (ước tính)

~130–150 bytes / dòng. 4 symbol × 24h × 365d ≈ ~5.3 MB/năm — rất nhỏ so với giới hạn GitHub.
