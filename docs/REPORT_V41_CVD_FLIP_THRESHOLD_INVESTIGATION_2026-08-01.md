# REPORT — V4.1 CVD Flip threshold investigation (NEAR 30d)

**Date:** 2026-08-01
**Scope:** V4.1 only — điều tra `detectCvdFlip` (TR); **không** sửa production / không chọn ngưỡng
**n:** 179 · non-neutral: 131 · cvdFlip pass: **12** (6.7%)

## Bước 1 — Trích dẫn nguyên văn

### `detectCvdFlip` (`services/v41/reversalDetector.ts`)

```ts
function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
}

/** CVD flip — đổi chiều rõ ràng trên 3 nến cuối.
 *  BULL (đảo bearish): dương → dương → âm.
 *  BEAR (đảo bullish): âm → âm → dương.
 */
export function detectCvdFlip(
  klines: KlineV41[],
  trendDirection: TrendDirection,
): boolean {
  if (klines.length < 3 || trendDirection === 'NEUTRAL') return false;
  const last3 = klines.slice(-3).map(cvdProxy);
  const [a, b, c] = last3;
  if (trendDirection === 'BULL') {
    return a > 0 && b > 0 && c < 0;
  }
  return a < 0 && b < 0 && c > 0;
}
```

### Điều kiện confirmed

| Yếu tố | Chi tiết |
|--------|----------|
| CVD proxy | `takerBuyVolume - (volume - takerBuyVolume)` = `2*takerBuy − volume` |
| Cửa sổ | **3 nến 1H cuối** `[a,b,c]` |
| Ngưỡng số magnitude | **Không có** — chỉ so sánh dấu với **0** (`>` / `<`) |
| `trendDirection` | **Có** — `NEUTRAL` → luôn `false`; BULL chỉ nhận flip bearish; BEAR chỉ nhận flip bullish |

**Khác Exhaustion:** không tồn tại floor kiểu `≥ 55`. “Ngưỡng” duy nhất là **0** (ranh giới dấu).

### So sánh Momentum1H (`momentumEngine1H.ts`)

```ts
// Momentum — continuation, KHÔNG nhận trendDirection
function detectCvdRising(klines): boolean {
  return lastThree.every((k) => computeCvd(k) > 0); // +++
}
function detectCvdFalling(klines): boolean {
  return lastThree.every((k) => computeCvd(k) < 0); // ---
}
```

| | TR `detectCvdFlip` | Momentum `detectCvdRising/Falling` |
|---|--------------------|-------------------------------------|
| Pattern | **Flip** `++-` hoặc `--+` | **Continuation** `+++` hoặc `---` |
| `trendDirection` | Bắt buộc (lock hướng) | Không dùng |
| Proxy | `cvdProxy` (cùng ý 2×buy−vol) | `computeCvd` (cùng dạng) |
| Lookback | 3 nến 1H | 3 nến 1H |
| Pass trên mẫu này | 12/179 | rising 23 + falling 46 (either 69) |

## Bước 2 — Phân phối giá trị thô (so sánh với ngưỡng 0)

Biểu thức so sánh: `a ? 0`, `b ? 0`, `c ? 0`. Đo `cvd2` (=c), `|cvd2|`, `flipMag=|c−(a+b)/2|`, và `last_signed_vs_required` (độ sâu vào nửa mặt phẳng đúng hướng flip).

### `cvd2` (CVD proxy nến cuối)

- All n=179: n=179 min=-3465888.00 p25=-199960.50 med=-50591.00 mean=-98701.11 p75=99667.50 p90=232690.40 max=929259.00
- Non-neutral: n=131 min=-1323317.00 p25=-197329.50 med=-50591.00 mean=-67844.85 p75=93628.00 p90=238069.00 max=929259.00
- Dấu cvd2: + 73 · − 106 · 0 0

### `|cvd2|`

- Directed: n=131 min=1832.00 p25=70887.00 med=154360.00 mean=217698.32 p75=288162.50 p90=431178.00 max=1323317.00
- Pass only: n=12 min=1832.00 p25=107963.00 med=184807.50 mean=186568.25 p75=241975.00 p90=369791.20 max=419435.00

### `flipMag = |c − (a+b)/2|` (cùng đại lượng dùng trong score CVD sau confirm)

- All: n=179 min=940.00 p25=99143.25 med=183013.50 mean=313299.81 p75=403010.25 p90=725688.70 max=3203511.00
- Pass: n=12 min=200549.50 p25=298473.13 med=453559.75 mean=609488.92 p75=1027241.38 p90=1161054.80 max=1248047.00

### `last_signed_vs_required` (>0 = nến cuối đúng phía flip)

- Directed: n=131 min=-1323317.00 p25=-179575.50 med=-50408.00 mean=-42920.32 p75=122165.50 p90=255170.00 max=898154.00
- Pass: n=12 min=1832.00 p25=107963.00 med=184807.50 mean=186568.25 p75=241975.00 p90=369791.20 max=419435.00

### Verdict khả thi của ngưỡng 0

- **Khả thi:** cvd2 quan sát được **cả hai phía** của 0 (min=-3465888.00, max=929259.00).
- **Không** cùng lỗi Exhaustion cũ (ngưỡng > max quan sát). Max `|cvd2|` >> 0.
- Tần suất thấp đến từ **pattern + direction lock**, không từ floor magnitude bất khả thi.

### Failure taxonomy

| Lý do | n=179 | non-neutral |
|-------|-------|-------------|
| PASS | 12 | 12 |
| NEUTRAL | 48 | 0 |
| NO_PRIOR_SAME_SIGN | 85 | 85 |
| NO_FLIP_ON_LAST | 34 | 34 |
| WRONG_FLIP_DIRECTION | 0 | 0 |
| SHORT_WINDOW | 0 | 0 |

## Bước 3 — Sweep thay thế (không chọn / không sửa production)

Vì không có floor magnitude để “hạ”, sweep tập trung vào **nới pattern** (dựa trên phân phối thật) và **deadband** quanh 0.

### Pattern sweep

| Phương án | Điều kiện | Pass (n=179) | % |
|-----------|-----------|--------------|---|
| production_flip | BULL: a>0∧b>0∧c<0 · BEAR: a<0∧b<0∧c>0 (hiện tại) | 12 | 6.7% |
| priorAvg_vs_c | BULL: priorAvg>0∧c<0 · BEAR: priorAvg<0∧c>0 (bỏ yêu cầu cả a và b cùng dấu) | 25 | 14.0% |
| any_prior_vs_c | BULL: (a>0∨b>0)∧c<0 · BEAR: (a<0∨b<0)∧c>0 | 34 | 19.0% |
| deadband_p25 | Production pattern + |cvd|>p25(|cvd2| directed)=70887.00 | 6 | 3.4% |

### Deadband epsilon sweep (giữ pattern production, yêu cầu `|cvd| > eps`)

| eps | Pass directed-pattern | % of n=179 |
|-----|----------------------|------------|
| eps=0 (production) | 12 | 6.7% |
| eps≈70887.00 | 6 | 3.4% |
| eps≈154360.00 | 4 | 2.2% |
| eps≈288162.50 | 1 | 0.6% |

eps ứng viên lấy từ phân phối `|cvd2|` directed: 0, p25=70887.00, median=154360.00, p75=288162.50.

## Kết luận điều tra (không phải khuyến nghị production)

1. `detectCvdFlip` **không** có ngưỡng magnitude bất khả thi kiểu Exhaustion≥55.
2. Confirmed = pattern dấu 3 nến + khớp `trendDirection`; ngưỡng so sánh = **0**.
3. Pass 12/179 chủ yếu do pattern flip hiếm + 48 nến NEUTRAL bị loại + 85 directed thiếu prior cùng dấu.
4. Không chọn mốc thay thế trong task này.

## Artefacts

- `docs/exports/v41-cvd-flip-threshold-investigation-30d.csv`
- `docs/exports/v41-cvd-flip-threshold-investigation-30d-summary.json`
- `scripts/investigate-v41-cvd-flip-threshold-30d.ts`
