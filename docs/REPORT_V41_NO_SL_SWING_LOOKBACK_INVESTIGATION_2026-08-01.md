# REPORT — NO_SL / SWING_LOOKBACK investigation (NEAR 180d)

**Date:** 2026-08-01
**Scope:** Điều tra only — **không** đổi `SWING_LOOKBACK` production / không chọn lookback mới

## Verdict

**`SWING_LOOKBACK=10` không phải nguyên nhân chính của 5 lệnh NO_SL.** Tăng lookback lên 15/20/25 **không giảm** NO_SL (vẫn 5/32, recovered 0/5). Nguyên nhân chính: **entry = close nến 4H** trong khi cửa sổ 1H cho SL cắt tại **openTime 4H** → giá entry có thể nằm ngoài toàn bộ range 1H gần nhất; EMA20 cũng sai phía → cả hai candidate bị loại.

## 1. Năm lệnh NO_SL (180d, conf≥40)

| timestamp_iso | side | entry |
|---|---|---|
| 2026-02-05T16:00:00.000Z | LONG | 1.016 |
| 2026-03-03T00:00:00.000Z | SHORT | 1.419 |
| 2026-03-15T00:00:00.000Z | SHORT | 1.355 |
| 2026-05-06T12:00:00.000Z | SHORT | 1.509 |
| 2026-07-27T12:00:00.000Z | LONG | 1.771 |

## 2. Vì sao cả EMA + swing (lookback=10) đều sai phía

| iso | side | entry | EMA20 | swing(10) | swingCand | emaCand | swing_ok | ema_ok | Giải thích |
|---|---|---|---|---|---|---|---|---|---|
| 2026-02-05T16:00:00.000Z | LONG | 1.016 | 1.1183 | 1.0330 | 1.0299 | 1.1127 | false | false | entry_at_or_below_swingLow (new low / outside prior range) |
| 2026-03-03T00:00:00.000Z | SHORT | 1.419 | 1.2899 | 1.4140 | 1.4182 | 1.2963 | false | false | entry_at_or_above_swingHigh (new high / outside prior range) |
| 2026-03-15T00:00:00.000Z | SHORT | 1.355 | 1.3149 | 1.3270 | 1.3310 | 1.3215 | false | false | entry_at_or_above_swingHigh (new high / outside prior range) |
| 2026-05-06T12:00:00.000Z | SHORT | 1.509 | 1.3637 | 1.5010 | 1.5055 | 1.3705 | false | false | entry_at_or_above_swingHigh (new high / outside prior range) |
| 2026-07-27T12:00:00.000Z | LONG | 1.771 | 1.8306 | 1.8140 | 1.8086 | 1.8215 | false | false | entry_at_or_below_swingLow (new low / outside prior range) |

**Pattern:** entry (4H close) nằm **ngoài** swing extreme của 10 nến 1H tính tới 4H **open**. EMA20 cũng sai phía → `NaN` / NO_SL.

### 2b. Mismatch cửa sổ 4H-close vs 1H-at-open

| iso | side | entry | 4H high | 4H low | swing10@open | no_sl@open lb10 | no_sl nếu 1H thru 4H lb10 | min lookback@open | min lookback thru4H |
|---|---|---|---|---|---|---|---|---|---|
| 2026-02-05T16:00:00.000Z | LONG | 1.016 | 1.088 | 1.012 | 1.0330 | true | false | none≤200 | 10 |
| 2026-03-03T00:00:00.000Z | SHORT | 1.419 | 1.424 | 1.344 | 1.4140 | true | false | none≤200 | 10 |
| 2026-03-15T00:00:00.000Z | SHORT | 1.355 | 1.377 | 1.316 | 1.3270 | true | false | 28 | 10 |
| 2026-05-06T12:00:00.000Z | SHORT | 1.509 | 1.516 | 1.429 | 1.5010 | true | false | none≤200 | 10 |
| 2026-07-27T12:00:00.000Z | LONG | 1.771 | 1.835 | 1.77 | 1.8140 | true | false | 54 | 10 |

Counterfactual (không đề xuất đổi production): nếu SL dùng 1H bars **trong** nến 4H (`openTime ≤ 4H open + 3h`), nhiều case NO_SL biến mất ngay ở lookback=10 vì swing extreme khi đó bao được high/low đã tạo entry.

## 3–4. Sweep SWING_LOOKBACK (cửa sổ hiện tại = 1H ≤ 4H open)

| Lookback | NO_SL count (32 lệnh) | Trung bình sl_dist_pct (toàn bộ hợp lệ) | Trung bình sl_dist_pct (5 case cũ, nếu recover) |
|---|---|---|---|
| 10 (hiện tại) | 5 | 1.766% | n/a% (recovered 0/5) |
| 15 | 5 | 1.831% | n/a% (recovered 0/5) |
| 20 | 5 | 1.856% | n/a% (recovered 0/5) |
| 25 | 5 | 1.895% | n/a% (recovered 0/5) |

### Ảnh hưởng sl_dist khi tăng lookback

- Mean sl_dist_pct (27 lệnh hợp lệ): **1.766%** @10 → **1.895%** @25 (Δ +0.128 pp).
- Tăng lookback **không cứu** 5 NO_SL nhưng **làm SL hơi xa hơn** trên các lệnh còn lại.

### Counterfactual sweep (1H thru 4H) — chỉ để so sánh

| Lookback | NO_SL (thru 4H window) | mean sl_dist_pct |
|---|---|---|
| 10 | 0 | 2.005% |
| 15 | 0 | 2.005% |
| 20 | 0 | 2.059% |
| 25 | 0 | 2.061% |

## 5. Kết luận điều tra (không chọn lookback)

- Lookback 10→25: NO_SL **không đổi** (5/32); recovered **0/5**.
- Mean sl_dist tăng nhẹ (~1.766% → ~1.895%) trên lệnh đã có SL.
- **Kết luận:** NO_SL chủ yếu do **lệch thời điểm entry (4H close) vs cửa sổ SL (1H tới 4H open)** + EMA sai phía; **không** phải vì `SWING_LOOKBACK=10` quá ngắn trong khoảng đã thử.
- Không đổi production trong task này.

## Artefacts

- `docs/exports/v41-no-sl-cases-detail-180d.csv`
- `docs/exports/v41-no-sl-swing-lookback-sweep-180d.csv`
- `docs/exports/v41-no-sl-4h-1h-window-mismatch-180d.csv`
- `docs/exports/v41-no-sl-swing-lookback-summary.json`
- `scripts/investigate-v41-no-sl-swing-lookback.ts`
- `scripts/investigate-v41-no-sl-swing-lookback-ext.ts` (bổ sung mismatch 4H/1H)
