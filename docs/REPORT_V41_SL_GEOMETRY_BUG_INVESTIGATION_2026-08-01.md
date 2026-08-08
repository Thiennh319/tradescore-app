# REPORT — V4.1 SL geometry bug investigation (`computeCounterTrendSL`)

**Date:** 2026-08-01
**Priority:** cao — SL sai phía = không bảo vệ vị thế
**Scope:** điều tra only — **không** sửa production trong task này

## 1. Nguyên văn hàm

`services/v41/reversalDetector.ts` (~L319–344):

```ts
export function computeCounterTrendSL(params: ComputeCounterTrendSLParams): number {
  const { klines1H, direction } = params; // ⚠️ entryPrice KHÔNG được destructure/dùng

  // ... EMA20 trên closes 1H, recent = last SWING_LOOKBACK(10) nến 1H

  if (direction === 'SHORT') {
    const swingHigh = Math.max(...recent.map(k => k.high));
    const slCandidate1 = swingHigh * 1.003;
    const slCandidate2 = lastEma * 1.005;
    return Math.min(slCandidate1, slCandidate2) * (1 + SL_BUFFER); // SL_BUFFER=0.003
  }

  const swingLow = Math.min(...recent.map(k => k.low));
  const slCandidate1 = swingLow * 0.997;
  const slCandidate2 = lastEma * 0.995;
  return Math.max(slCandidate1, slCandidate2) * (1 - SL_BUFFER);
}
```

| Input | Thực tế |
|-------|---------|
| Timeframe | **1H** klines |
| ATR | **Không dùng** |
| Swing | SHORT→swing **high** · LONG→swing **low** (lookback 10) — hướng swing **đúng** |
| EMA | EMA20 close 1H |
| `entryPrice` | Có trong type params nhưng **bị bỏ qua hoàn toàn** |

Xác minh runtime: đổi `entryPrice` ×10 → SL không đổi = **false**.

## 2. Nguyên nhân gốc

**Không** phải if/else LONG/SHORT bị đảo (swing high/low đúng hướng).
**Không** phải ATR NaN (không có ATR).

Cơ chế lỗi:

1. Candidate EMA (`lastEma×1.005` SHORT / `lastEma×0.995` LONG) **không** được ràng buộc so với `entry`.
2. Khi giá đã chạy **xa khỏi EMA** theo hướng có lợi cho lệnh (vd. LONG khi giá dưới EMA; SHORT khi giá trên EMA), candidate EMA nằm **sai phía** so với entry.
3. `Math.min` (SHORT) / `Math.max` (LONG) chọn candidate “chặt” hơn → **ưu tiên đúng cái EMA sai phía**.
4. Buffer ±0.3% không cứu được khi candidate đã sai phía.

Hệ quả: SL nằm về phía **lãi** (hoặc sát/vượt entry) → không bảo vệ; TP/SL geometry trong backtest trở nên vô nghĩa (nhiều BOTH / INVALID).

## 3. Trace 4 timestamp lỗi (từng bước)

| iso | side | entry | EMA20 | swing | cand_swing | cand_ema | chosen | SL | EMA vs entry | wrong? |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-02-03T20:00:00.000Z | LONG | 1.176 | 1.185978 | 1.122000 | 1.118634 | 1.180048 | 1.180048 | 1.176508 | above | **true** |
| 2026-03-12T08:00:00.000Z | SHORT | 1.322 | 1.297008 | 1.330000 | 1.333990 | 1.303493 | 1.303493 | 1.307403 | below | **true** |
| 2026-07-15T12:00:00.000Z | SHORT | 2.076 | 2.029775 | 2.099000 | 2.105297 | 2.039923 | 2.039923 | 2.046043 | below | **true** |
| 2026-07-18T08:00:00.000Z | LONG | 1.904 | 1.925975 | 1.904000 | 1.898288 | 1.916345 | 1.916345 | 1.910596 | above | **true** |

### Root cause từng case

- **2026-02-03T20:00:00.000Z** (LONG): EMA*0.995 ≥ entry → Math.max picks EMA candidate → SL above entry for LONG
- **2026-03-12T08:00:00.000Z** (SHORT): EMA*1.005 ≤ entry → Math.min picks EMA candidate → SL below entry for SHORT
- **2026-07-15T12:00:00.000Z** (SHORT): EMA*1.005 ≤ entry → Math.min picks EMA candidate → SL below entry for SHORT
- **2026-07-18T08:00:00.000Z** (LONG): EMA*0.995 ≥ entry → Math.max picks EMA candidate → SL above entry for LONG

## 4. Tần suất trên 32 lệnh active (180d, conf≥40)

| Metric | Giá trị |
|--------|---------|
| n lệnh | 32 |
| SL sai phía | **20** (62.5%) |
| · LONG sai phía | 6 |
| · SHORT sai phía | 14 |
| Sai phía do chọn EMA candidate | **20** / 20 |
| sl_dist < 0.05% | 2 (trong đó wrong=1) |

→ Lỗi **không** chỉ ở 4/7 BOTH: ảnh hưởng đa số lệnh active trong mẫu 32. Không giới hạn ở `sl_dist` cực nhỏ (nhiều case wrong với dist vài %).

## 5. Kết luận & hướng sửa (chưa áp dụng)

| Hạng mục | Nội dung |
|----------|----------|
| Bug ở đâu | `computeCounterTrendSL` L319–344: bỏ `entryPrice`; `Math.min`/`Math.max` với EMA candidate không clamp |
| Điều kiện gây lỗi | EMA20 nằm sai phía so với entry (giá đã chạy khỏi EMA) + hàm chọn EMA candidate |
| Ảnh hưởng mẫu 32 | 20/32 = 62.5% lệnh SL sai phía |
| ATR? | Không liên quan |
| Swing nhầm high/low? | Không — swing đúng hướng |

**Đề xuất sửa (không làm trong task này):**

1. Dùng `entryPrice`: SHORT bắt buộc `sl > entry`; LONG bắt buộc `sl < entry`.
2. Loại candidate EMA nếu sai phía; fallback swing-only (hoặc ATR nếu muốn).
3. Nếu không còn candidate hợp lệ → `NaN` / skip trade (an toàn hơn SL sai phía).
4. Unit test tái hiện 4 timestamp trên + case entry xa EMA.

## Artefacts

- `docs/exports/v41-sl-geometry-bug-steps-4cases.csv`
- `docs/exports/v41-sl-geometry-bug-32trades.csv`
- `docs/exports/v41-sl-geometry-bug-summary.json`
- `scripts/investigate-v41-sl-geometry-bug.ts`
