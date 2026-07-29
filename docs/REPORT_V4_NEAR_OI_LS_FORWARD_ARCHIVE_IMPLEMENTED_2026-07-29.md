# REPORT — Phương án C: Archive OI/LS forward — file local đã tạo (T4)

**Date / timezone:** 2026-07-29 (+07)  
**Engine / product:** 1.0.8  
**Phạm vi:** V4 / Binance public data only — không v4.1  
**Repo visibility:** **PUBLIC** (xác nhận user) → GitHub Actions `schedule` + phút OK  
**Nhánh tạo file:** `feature/ui-redesign` (local)  
**Default branch (local có):** `master` — **xác nhận tên default thật trên GitHub** (`main` hay `master`) trước khi merge  
**Push / merge / trigger workflow:** **Chưa** — chờ review thủ công  

Thiết kế gốc: `docs/REPORT_V4_NEAR_OI_LS_FORWARD_ARCHIVE_SETUP_2026-07-29.md`

---

## 1. Quyết định đã chốt

| Mục | Chọn |
|---|---|
| Storage | S1 — `data/market-archive/nearusdt_1h.csv` |
| Trigger | T4 — GitHub Actions cron mỗi giờ |
| Git | Commit CSV vào repo (không gitignore) |
| Heal | 24h OI/LS hist mỗi lần chạy |
| Symbol phase 1 | NEARUSDT only |

---

## 2. File đã tạo (local)

| Path | Vai trò |
|---|---|
| `scripts/archive-oi-ls-funding.ts` | Collector: raw `fetch` Binance public, heal 24h, upsert CSV |
| `scripts/check-market-archive-progress.ts` | coverage_pct, gap_list, ready_90d |
| `data/market-archive/README.md` | Schema + hướng dẫn Actions |
| `data/market-archive/nearusdt_1h.csv` | Archive (đã có dữ liệu sau smoke-test local) |
| `.github/workflows/archive-oi-ls-funding.yml` | cron `0 * * * *` + `workflow_dispatch` + commit bot |

**Không tạo:** Task Scheduler `.ps1`, không sửa `scorerV4` / `tradePlanV4`.

---

## 3. Smoke-test local (2026-07-29)

Lệnh:

```bash
npx --yes tsx scripts/archive-oi-ls-funding.ts
npx --yes tsx scripts/check-market-archive-progress.ts
```

Kết quả:

| Metric | Giá trị |
|---|---|
| Rows sau heal ~24h | ~25 |
| Giờ hiện tại | `2026-07-29T00:00:00.000Z` — `status=ok` (có oi + ls + funding) |
| Giờ heal cũ | `partial` (thiếu funding lịch sử — đúng thiết kế) |
| coverage_pct | 100% trên span ~1 ngày |
| ready_90d | **NO** (mới bắt đầu) |

---

## 4. Workflow YAML (tóm tắt)

- Triggers: `schedule: '0 * * * *'` + `workflow_dispatch`
- `permissions: contents: write`
- `concurrency: archive-oi-ls-near` / `cancel-in-progress: false`
- Steps: checkout → Node 20 → `npx --yes tsx scripts/archive-oi-ls-funding.ts` → commit/push nếu CSV đổi
- Commit message: `chore(archive): NEAR OI/LS hourly snapshot`
- **Không** `on: push` → bot commit không tự kích hoạt lại workflow
- Secret: chỉ `GITHUB_TOKEN` mặc định — endpoint Binance **public**, không API key

---

## 5. Việc bạn làm thủ công sau review

1. Review kỹ `archive-oi-ls-funding.ts` + `archive-oi-ls-funding.yml`.
2. Commit + PR/merge các file này vào **default branch** trên GitHub.
3. Tab **Actions** → **Archive OI/LS funding (NEAR)** → **Run workflow** (`workflow_dispatch`) 1–2 lần.
4. Kiểm tra: CSV có dòng mới + commit từ `github-actions[bot]`.
5. Để cron chạy; **ngày đầu** kiểm tra vài run trên tab Actions.
6. Định kỳ: `npx tsx scripts/check-market-archive-progress.ts` — khi `ready_90d=YES` mới mở task backtest 90d “thật 100%”.

---

## 6. Kết luận 1 dòng

> Phương án C (T4/public) đã **tạo đủ file local** và smoke-test collector OK; **chưa** push/merge/bật cron — chờ bạn review rồi tự merge vào default branch và chạy `workflow_dispatch` thử.
