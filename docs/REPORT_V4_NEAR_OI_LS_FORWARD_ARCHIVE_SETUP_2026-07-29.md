# REPORT — Thiết kế Phương án C: Archive OI/LS/funding forward (NEAR)

**Date / timezone:** 2026-07-29 (+07)  
**Engine / product:** 1.0.8  
**Phạm vi:** Thiết kế + **file local đã tạo** — **chưa push / chưa merge / chưa bật cron**  
**Repo visibility (xác nhận user):** **PUBLIC** → T4 schedule + phút OK (§10.1)  
**Default branch (local):** có nhánh `master` — **xác nhận tên default trên GitHub trước khi merge** (có thể là `master` hoặc `main`)  
**Không dùng:** V4.1, `runAdvancedBacktest`  
**Không sửa:** `scorerV4.ts` / `tradePlanV4.ts`  
**Không thêm:** dependency / API key mới  
**Commit / push:** **Không** (chờ bạn review + tự merge)

---

## 1. Mục đích

Binance public Futures Data chỉ giữ OI/L/S lịch sử ~**30 ngày**. Để sau này chạy lại backtest 90/180/365d với OI/LS **thật 100%** (không fallback), cần **tự lưu** điểm dữ liệu mỗi giờ từ bây giờ.

Phương án A (30d sạch) đã củng cố baseline; Phương án C là hạ tầng **dài hạn**, không gấp — ưu tiên đúng & ổn định.

---

## 2. Khảo sát hiện trạng (repo)

### 2.1 Đã có — có thể tái sử dụng ý tưởng

| Thành phần | Ghi chú |
|---|---|
| Endpoints Binance | `services/binanceApi.ts`: `fetchOIEngine`, `fetchLongShortRatio`, `fetchFundingRateHistory` |
| Pattern Node fetch sạch | `scripts/backtest-v4-near-90d.ts` — `fetch` trực tiếp + throttle, **không** AsyncStorage; đã paginate OI/LS |
| Ghi file CSV | Nhiều script ghi `docs/exports/*.csv` bằng `fs.writeFileSync` |
| Symbol list | `TRADE_SYMBOLS` (BTC/NEAR/SOL/BNB) — thiết kế mở rộng sau; task này chỉ **NEARUSDT** |

### 2.2 Không có — khoảng trống

| Hạ tầng | Trạng thái |
|---|---|
| Thư mục `docs/archive/` / `data/` archive append | **Không** |
| Cron / Task Scheduler / daemon thu thập market | **Không** |
| GitHub Actions `schedule` / cloud function / Express always-on | **Không** |
| DB (SQLite…) cho market hist | **Không** |

### 2.3 Môi trường chạy

- Stack chính: **Expo / React Native** + web EXE local (`WebLauncher` chỉ sống khi EXE mở).
- **Không có server luôn bật** trong product.
- `react-native-background-actions` / `expo-background-task` phục vụ scan/position UX — **không** phù hợp làm archive khoa học 90 ngày (app tắt = mất điểm).

### 2.4 Ràng buộc kỹ thuật quan trọng — `binanceApi.ts` vs Node cron

Các hàm `fetchOIEngine` / `fetchLongShortRatio` / `fetchFundingRateHistory` đi qua **cache AsyncStorage** (`services/storage.ts`). Import trực tiếp vào script Node cron **dễ vỡ** (cùng vấn đề shim RN đã gặp ở runner backtest).

**Đề xuất nguồn dữ liệu (giữ đúng endpoint, không đổi URL):**

| Cách | Mô tả | Khuyến nghị |
|---|---|---|
| **A (ưu tiên)** | Collector Node gọi **cùng URL** như `binanceApi` (raw `fetch`, pattern `backtest-v4-near-90d.ts`) | **Chọn** — ổn định, không phụ thuộc AsyncStorage |
| B | Import `binanceApi` + shim RN | Không khuyến nghị cho job dài hạn |
| C | Refactor tách “pure HTTP” khỏi cache trong `binanceApi` | Scope lớn hơn, ngoài task thiết kế này |

→ Vẫn “dùng lại đúng endpoint đã có”; không thêm API/provider mới.

---

## 3. Thiết kế thu thập dữ liệu

### 3.1 Tần suất & symbol

| Mục | Giá trị |
|---|---|
| Cadence | **1 lần / giờ** (khớp clock 1h backtest V4) |
| Symbol phase 1 | **NEARUSDT** only |
| Mở rộng sau | Thêm symbol qua list config — **không** tự thêm coin trong lần triển khai đầu |
| Period OI/LS API | `1h` |
| Funding | Lấy điểm funding **mới nhất** mỗi lần chạy (Binance funding ~8h; lưu khi đổi + snapshot giờ cũng được) |

### 3.2 Snapshot mỗi lần chạy (tối thiểu)

| Field | Kiểu | Ghi chú |
|---|---|---|
| `timestamp` | ms UTC | Làm tròn về **đầu giờ UTC** của bar 1h (`floor(now/3600000)*3600000`) |
| `symbol` | string | `NEARUSDT` |
| `oi` | number \| null | `sumOpenInterest` (hoặc snapshot `openInterest` nếu hist thiếu) |
| `ls_top_ratio` | number \| null | Từ `topLongShortAccountRatio` (đúng nguồn app đang dùng) |
| `ls_global_ratio` | number \| null | Optional: `globalLongShortAccountRatio` nếu gọi thêm cùng endpoint family — **mặc định null** phase 1 (app hiện copy top→global) |
| `funding_rate` | number \| null | Rate thập phân Binance (không ×100) |
| `source` | string | `forward_archive` (phân biệt với `api_backfill` nếu sau này backfill 30d) |
| `status` | `ok` \| `partial` \| `error` | Đánh dấu gap / lỗi từng field |
| `error` | string \| empty | Message ngắn nếu fail |
| `collected_at` | ms UTC | Wall-clock lúc job chạy |

Một **dòng / giờ / symbol** (upsert theo `timestamp+symbol`, không nhân bản).

### 3.3 Xử lý lỗi

- Mỗi endpoint try/catch riêng → lỗi 1 nguồn không chặn nguồn khác (`status=partial`).
- Timeout (ví dụ 15–20s) → ghi `status=error` / field null, **không crash** process (exit code 0 nếu đã ghi dòng gap; exit ≠0 chỉ khi không ghi được file).
- Log stderr ngắn + append dòng archive với field thiếu — để script progress nhận diện **gap**.

### 3.4 Chống trùng & heal gap nhẹ

- Trước khi append: nếu đã có `timestamp` cùng symbol → skip hoặc overwrite cùng dòng.
- Optional mỗi lần chạy: lấy thêm `openInterestHist` / L/S `limit=24` gần nhất và merge — **hàn** tối đa ~24h nếu PC tắt vài giờ (không vượt trần Binance ~30d).

---

## 4. Nơi lưu trữ — phương án (CHỜ XÁC NHẬN)

### So sánh

| ID | Nơi lưu | Ưu | Nhược | Fit stack |
|---|---|---|---|---|
| **S1** | `data/market-archive/` CSV append (hoặc JSONL) | Đơn giản, diff được, cùng kiểu `docs/exports` | Cần `.gitignore` nếu không muốn commit data lớn | **Cao — khuyến nghị** |
| S2 | `docs/archive/oi-ls/` CSV | Gần docs | Lẫn với báo cáo Markdown | Trung bình |
| S3 | SQLite | Query dễ | Dependency / schema mới | Thấp lúc này |
| S4 | AsyncStorage / app storage | Có sẵn trên device | Sai runtime; mất khi clear app; không cho backtest Node | **Loại** |

### Đề xuất mặc định (S1) — chờ bạn chốt

```
data/market-archive/
  README.md                 # schema + cadence (sau khi duyệt)
  nearusdt_1h.csv           # một file ghép OI+LS+funding theo giờ
  gaps.log                  # optional: dòng lỗi tóm tắt
```

**CSV header đề xuất:**

```text
timestamp,timestamp_iso,symbol,oi,ls_top_ratio,ls_global_ratio,funding_rate,source,status,error,collected_at
```

- Commit policy đề xuất: **gitignore `*.csv` data**, chỉ commit README + scripts — tránh phình repo; bạn có thể chọn ngược lại nếu muốn backup qua git.

---

## 5. Cơ chế chạy định kỳ — phương án (CHỜ XÁC NHẬN)

### So sánh trigger

| ID | Trigger | Cần hạ tầng mới? | Độ tin cậy 90 ngày | Fit hiện tại |
|---|---|---|---|---|
| **T1** | **Windows Task Scheduler** → `npx tsx scripts/...` mỗi giờ | Có (đăng ký task trên máy Windows của bạn) | Cao **nếu PC luôn bật / không sleep** | **Cao — khuyến nghị phase 1** |
| T2 | Node loop `setInterval` chạy nền khi mở terminal/EXE | Nhẹ | Thấp nếu tắt máy | Trung bình (dev) |
| T3 | Piggyback app background scan | Không | Thấp (app kill = gap) | Thấp cho archive khoa học |
| T4 | GitHub Actions `cron` | Repo + runner/cloud | Cao nếu public API từ Actions OK | Chưa có workflow — cần quyết định riêng |
| T5 | VPS / cloud function luôn bật | Có (chi phí + setup) | Cao nhất | Ngoài stack hiện tại |

### Giới hạn môi trường (bắt buộc nêu rõ)

Project **không** có server luôn chạy. Archive chỉ đầy đủ nếu:

1. Máy Windows (hoặc host bạn chọn) **bật và thức** đúng giờ chạy job, **hoặc**
2. Bạn đầu tư host luôn bật (T4/T5).

Nếu PC sleep/off nhiều đêm → sẽ có **gap**; script progress phải báo rõ. Heal 24h giúp nhẹ; mất >~30 ngày liên tục thì **không backfill** được từ Binance.

### Đề xuất mặc định (T1) — chờ bạn chốt

1. Script collector: `scripts/archive-oi-ls-funding.ts` (NEARUSDT, 1 điểm/lần).
2. Wrapper PowerShell: `scripts/archive-oi-ls-funding.ps1` (cd repo, `npx tsx …`, log file).
3. Helper đăng ký (optional): `scripts/register-market-archive-task.ps1` tạo `schtasks` hourly.
4. Bạn chạy helper **một lần** (quyền user) sau khi duyệt — agent **không** tự đăng ký Task Scheduler khi chưa được phép.

---

## 6. Script theo dõi tiến độ archive

Sau khi có collector, thêm lệnh kiểm tra (không chạy backtest):

**Ví dụ:** `npx tsx scripts/check-market-archive-progress.ts --symbol NEARUSDT`

Output mong muốn:

| Metric | Ý nghĩa |
|---|---|
| `first_ts` / `last_ts` | Ngày bắt đầu–kết thúc archive |
| `expected_hours` | Số giờ lý thuyết trong span |
| `actual_ok_hours` | Số dòng `status=ok` (hoặc có đủ oi+ls) |
| `coverage_pct` | actual / expected |
| `gap_list` | Danh sách khoảng thiếu (start–end, số giờ) |
| `ready_90d` | `YES` nếu span liên tục ≥90 ngày **và** coverage ≥ ngưỡng (ví dụ ≥95%) |

→ Sau ~90 ngày nhìn một lệnh biết đã đủ để backtest 90d “thật 100%” hay chưa.

---

## 7. Lộ trình triển khai (đã thay bằng §12 — T4)

Lộ trình cũ (T1/Task Scheduler) **không còn áp dụng**. Xem §12.

---

## 8. Danh sách file cũ (đã thay bằng §11)

Danh sách T1/ps1/gitignore **đã hủy**. Danh sách chốt: **§11**.

---

## 9. Quyết định đã chốt (2026-07-29)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Storage | **S1** — `data/market-archive/nearusdt_1h.csv` |
| 2 | Trigger | **T4** — GitHub Actions `schedule` cron mỗi giờ (**không** T1) |
| 3 | Git | **Commit CSV vào repo** (Actions cần đọc/append/commit lại) — **không** gitignore CSV |
| 4 | Heal gap 24h | **Bật** |
| 5 | schtasks | **Không** — thay bằng workflow YAML |

---

## 10. Rủi ro GitHub Actions — kiểm tra trước khi tạo workflow

### 10.1 Free tier / phút chạy

| Loại repo | `schedule` cron | Phút Actions |
|---|---|---|
| **Public** | Chạy được | Thường **không tính** phút (free unlimited cho public) |
| **Private** (Free personal) | **`schedule` có thể bị tắt** (giới hạn kém tài liệu của GitHub Free) | ~**2.000 phút/tháng** (Free) |

Ước lượng job hourly: ~1–2 phút/lần × 24 × 30 ≈ **720–1.440 phút/tháng**.

- Nếu repo **private + Free**: có rủi ro (1) cron **không fire**, và/hoặc (2) chạm trần phút nếu job dài. Cần Pro hoặc workaround `workflow_dispatch` + cron ngoài (cần PAT — **không** muốn thêm secret nếu tránh được).
- Nếu repo **public**: T4 phù hợp nhất cho 90+ ngày.
- `package.json` có `"private": true` (npm) — **không** đồng nghĩa GitHub private. Local hiện **không thấy `git remote`** → cần bạn xác nhận repo GitHub là public hay private trước khi bật cron.

### 10.2 Vòng lặp commit / xung đột workflow

- Repo hiện **chưa có** `.github/workflows/` → không xung đột workflow cũ.
- Workflow archive **chỉ** trigger: `schedule` + `workflow_dispatch` — **không** `on: push` → commit CSV từ bot **không** tự kích hoạt lại chính workflow này.
- Commit message cố định, ví dụ: `chore(archive): NEAR OI/LS hourly snapshot` — dễ lọc trong history.
- `concurrency: group: archive-oi-ls` + `cancel-in-progress: false` — tránh chồng chéo nếu run chậm.
- **Lưu ý:** `schedule` chỉ chạy trên **default branch** (thường `main`). Workflow phải được merge vào default branch mới cron hoạt động. Branch hiện tại local: `feature/ui-redesign`.

### 10.3 Fail / network / rate limit

- Collector: try/catch từng endpoint → ghi dòng `status=partial|error`, **exit 0** nếu đã ghi được file (kể cả gap) → workflow xanh, lần sau heal 24h.
- Exit ≠0 chỉ khi không ghi được CSV / git commit lỗi nghiêm trọng.
- Fail một job **không** ảnh hưởng job khác (chưa có job khác).
- Binance public endpoints **không cần API key** — chỉ cần `GITHUB_TOKEN` mặc định (`permissions: contents: write`) để commit/push.

### 10.4 Endpoint public (xác nhận)

| Data | URL | Auth |
|---|---|---|
| OI hist | `GET https://fapi.binance.com/futures/data/openInterestHist` | Không |
| OI snapshot | `GET https://fapi.binance.com/fapi/v1/openInterest` | Không |
| L/S top | `GET https://fapi.binance.com/futures/data/topLongShortAccountRatio` | Không |
| Funding | `GET https://fapi.binance.com/fapi/v1/fundingRate` | Không |

→ **Không** thêm secret / API key mới.

### 10.5 `tsx` trong Actions

- Repo dùng `npx tsx` cho script; `tsx` **chưa** nằm trong `package.json`.
- Đề xuất workflow: `npx tsx scripts/archive-oi-ls-funding.ts` (không thêm dependency vào package.json trừ khi bạn muốn pin sau).

### 10.6 Spam commit

- Mỗi giờ **tối đa 1 commit** khi có thay đổi CSV; nếu không đổi (đã có đủ điểm) → **skip commit**.
- ~24 commit/ngày × 90 ngày ≈ **~2.160 commit** chỉ cho archive — chấp nhận được nhưng làm ồn `git log`. Có thể sau này squash/archive riêng; phase 1 giữ đơn giản.

---

## 11. Danh sách file — ĐÃ TẠO LOCAL (2026-07-29)

| # | Path | Trạng thái |
|---|---|---|
| 1 | `scripts/archive-oi-ls-funding.ts` | **Đã tạo** |
| 2 | `scripts/check-market-archive-progress.ts` | **Đã tạo** |
| 3 | `data/market-archive/README.md` | **Đã tạo** |
| 4 | `data/market-archive/nearusdt_1h.csv` | **Đã tạo** (có thể đã có dòng sau smoke-test local) |
| 5 | `.github/workflows/archive-oi-ls-funding.yml` | **Đã tạo** |
| 6 | Report này | **Đã cập nhật** |

**Chưa push / chưa merge vào default branch / chưa trigger workflow.**

### 11.1 Phác thảo workflow (chưa ghi file)

```yaml
name: Archive OI/LS funding (NEAR)
on:
  schedule:
    - cron: '0 * * * *'   # mỗi giờ UTC
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: archive-oi-ls-near
  cancel-in-progress: false

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx --yes tsx scripts/archive-oi-ls-funding.ts
      - name: Commit archive if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/market-archive/nearusdt_1h.csv
          git diff --staged --quiet && echo "No changes" && exit 0
          git commit -m "chore(archive): NEAR OI/LS hourly snapshot"
          git push
```

(`GITHUB_TOKEN` mặc định đủ nếu `permissions.contents: write`.)

### 11.2 Schema CSV (khóa)

```text
timestamp,timestamp_iso,symbol,oi,ls_top_ratio,ls_global_ratio,funding_rate,source,status,error,collected_at
```

---

## 12. Lộ trình thủ công sau khi review diff

1. Review 5 file trên nhánh `feature/ui-redesign` (đặc biệt collector + workflow YAML).
2. Commit local (bạn tự làm) → PR/merge vào **default branch** trên GitHub.
   - Local có nhánh `master`; remote hiện **không** cấu hình trong workspace này — mở GitHub → Settings/Branches để xem default thật (`main` hay `master`).
3. Tab **Actions** → workflow **Archive OI/LS funding (NEAR)** → **Run workflow** (`workflow_dispatch`) 1–2 lần.
4. Kiểm tra: CSV có dòng mới + commit bot `chore(archive): NEAR OI/LS hourly snapshot`.
5. Để cron `0 * * * *` tự chạy; ngày đầu kiểm tra vài run trên tab Actions.
6. Định kỳ: `npx tsx scripts/check-market-archive-progress.ts`.

---

## 13. Kết luận cập nhật

> Phương án C: **S1 + T4** đã **tạo file local**. Repo **PUBLIC** → rủi ro schedule/phút private Free **không áp dụng**. Chờ bạn review → tự merge vào default branch → `workflow_dispatch` thử → rồi để cron 90 ngày.
