# NEAR V4 — so sánh đa mốc (90 / 180 / 365d) & ổn định filter L6

**Generated:** 2026-08-07T02:55:42.824Z
**Engine:** scorerV4 + tradePlanV4 only (không sửa rule trong task này)
**Phạm vi:** V4 only — không v4.1

## 0. Độ phủ dữ liệu

| Mốc | span thực (ngày) | NEAR 1h bars | NEAR 4h bars | OI real % bars | LS real % bars | funding pts |
|---|---:|---:|---:|---:|---:|---:|
| 90d | 89.9 | 2379 | 619 | 34.38 | 34.38 | 298 |
| 180d | 179.9 | 4539 | 1159 | 17.18 | 17.18 | 568 |
| 365d | 364.9 | 8979 | 2269 | 8.47 | 8.47 | 1123 |

> OI/LS Binance futures data hist thường chỉ ~30 ngày (limit≈500 điểm 1h). Phần còn lại của cửa sổ 180/365d chạy với **fallback OI=0 / L:S=1** — làm giảm độ tin cậy của L5b/L7 trên mẫu dài; **L6 (funding)** dùng funding history dài hơn nên đáng tin hơn OI/LS.

## 1. Bảng WR / n theo mốc

| Mốc | Baseline WR / n | l6≥1 WR / n | l6≥1.5 WR / n |
|---|---|---|---|
| 90d | 69.57% / 69 | 68.85% / 61 | 71.05% / 38 |
| 180d | 76.55% / 145 | 76.38% / 127 | 76.32% / 76 |
| 365d | 79.86% / 288 | 78.81% / 236 | 79.17% / 144 |

### Chi tiết PF / Expectancy / MaxDD

#### 90d
- Baseline: n=69, WR=69.57%, PF=4.03, ExpR=0.42, MaxDD_R=2.00
- l6≥1: n=61, WR=68.85%, PF=4.26, ExpR=0.45, MaxDD_R=1.82
- l6≥1.5: n=38, WR=71.05%, PF=4.13, ExpR=0.45, MaxDD_R=2.11
- (tham chiếu) l1≥1.5: n=55, WR=70.91%, PF=4.51, ExpR=0.49, MaxDD_R=2.00
- (tham chiếu) l3≥2: n=46, WR=82.61%, PF=14.61, ExpR=0.65, MaxDD_R=0.95

#### 180d
- Baseline: n=145, WR=76.55%, PF=5.67, ExpR=0.51, MaxDD_R=2.00
- l6≥1: n=127, WR=76.38%, PF=5.88, ExpR=0.52, MaxDD_R=1.82
- l6≥1.5: n=76, WR=76.32%, PF=5.89, ExpR=0.53, MaxDD_R=2.11
- (tham chiếu) l1≥1.5: n=114, WR=76.32%, PF=5.88, ExpR=0.55, MaxDD_R=2.00
- (tham chiếu) l3≥2: n=108, WR=81.48%, PF=10.12, ExpR=0.64, MaxDD_R=1.01

#### 365d
- Baseline: n=288, WR=79.86%, PF=8.15, ExpR=0.62, MaxDD_R=2.00
- l6≥1: n=236, WR=78.81%, PF=7.74, ExpR=0.62, MaxDD_R=1.82
- l6≥1.5: n=144, WR=79.17%, PF=7.51, ExpR=0.62, MaxDD_R=2.11
- (tham chiếu) l1≥1.5: n=230, WR=79.57%, PF=8.46, ExpR=0.66, MaxDD_R=2.00
- (tham chiếu) l3≥2: n=213, WR=83.57%, PF=13.15, ExpR=0.71, MaxDD_R=1.64

## 2. Đánh giá độ ổn định

| Filter | WR 90→180→365 | Range (pp) | Edge vs baseline (pp) 90/180/365 | Luôn > baseline? |
|---|---|---:|---|:-:|
| l6≥1 | 68.85 → 76.38 → 78.81 | 9.96 | -0.71 / -0.17 / -1.05 | NO |
| l6≥1.5 | 71.05 → 76.32 → 79.17 | 8.11 | 1.49 / -0.24 / -0.69 | NO |
| baseline | 69.57 → 76.55 → 79.86 | 10.30 | — | — |

### Theo quý (trên mẫu 365d)

| Quý | Baseline WR/n | l6≥1 WR/n | l6≥1.5 WR/n |
|---|---|---|---|
| 2025-Q3 | 88.00% / 50 | 84.62% / 39 | 92.00% / 25 |
| 2025-Q4 | 80.00% / 60 | 78.72% / 47 | 70.59% / 34 |
| 2026-Q1 | 81.61% / 87 | 82.35% / 68 | 88.89% / 36 |
| 2026-Q2 | 71.43% / 56 | 71.43% / 49 | 72.41% / 29 |
| 2026-Q3 | 77.14% / 35 | 75.76% / 33 | 70.00% / 20 |

### Nhận xét ổn định

- Biên độ WR `l6≥1` giữa các mốc: **9.96 điểm %** (ngưỡng cảnh báo >10–15pp).
- Biên độ WR `l6≥1.5`: **8.11 điểm %**.
- Edge `l6≥1` vs baseline: -0.71pp, -0.17pp, -1.05pp — không luôn dương.
- Edge `l6≥1.5` vs baseline: 1.49pp, -0.24pp, -0.69pp — không luôn dương.

## 3. Ý nghĩa L6 trong scorerV4

**L6 = Funding layer (Group B — dòng tiền).**

Khi có `fundingMetrics` (current, velocity, acceleration — đơn vị %):

1. `classifyFundingState(current, velocity, acceleration)` → một trong:
   - EXTREME_LONG_EUPHORIA, LONG_EUPHORIA_FADING, LONG_FUNDING_ELEVATED,
   - NEUTRAL, SHORT_EUPHORIA_FADING, SHORT_SQUEEZE_BUILDING
2. Map điểm raw (max 2) theo hướng:

| State | LONG score | SHORT score |
|---|---:|---:|
| SHORT_SQUEEZE_BUILDING | 2 | 0 |
| SHORT_EUPHORIA_FADING | 1.5 | 0.5 |
| NEUTRAL | **1** | **1** |
| LONG_EUPHORIA_FADING | 0.5 | 1.5 |
| LONG_FUNDING_ELEVATED | 0.5 | 1.5 |
| EXTREME_LONG_EUPHORIA | 0 | 2 |

Hard-block riêng khi extreme squeeze ngược hướng (LONG + LONG_SQUEEZE / SHORT + SHORT_SQUEEZE).

- **`l6 ≥ 1`**: loại các setup có funding **bất lợi rõ** (score 0 hoặc 0.5) — giữ NEUTRAL trở lên theo hướng trade.
- **`l6 ≥ 1.5`**: chỉ giữ trạng thái funding **ủng hộ mạnh** (euphoria đối nghịch / squeeze building theo hướng có lợi).

Logic thị trường hợp lý một phần: không vào Long khi funding cực đoan long (đám đông trả funding cao → squeeze risk), và ngược lại cho Short. Tuy nhiên điểm L6 là **một phần Group B**; filter hậu kỳ trên trade đã `canEnter` có thể chỉ là tương quan mẫu — cần ổn định đa mốc mới coi là tín hiệu rule.

## 4. Kết luận — có nên sửa rule V4?

**Chưa đủ vững để sửa rule chính thức.** Edge L6 nhẹ hoặc không nhất quán đủ; giữ quan sát. Ưu tiên tin 180d nếu 365d bị nhiễu bởi OI/LS fallback (L6 funding vẫn OK).

*(internal tag: `YES_STRICT_WEAK`)*

### Đề xuất code (CHỈ đề xuất — chưa áp dụng)

Nếu duyệt soft filter, chỗ tự nhiên nhất là **sau** `canEnterV4(active)` ở call site (Signal Board / scan), không đổi công thức L6:

```ts
// ĐỀ XUẤT — chưa merge
import { l6RawScoreFromDirectional, canEnterV4 } from './scorerV4';

function canEnterV4WithFundingFloor(
  active: DirectionalScoreV4,
  minL6 = 1,
): boolean {
  if (!canEnterV4(active)) return false;
  return l6RawScoreFromDirectional(active) >= minL6;
}
```

Không sửa bảng `LONG_L6_BY_STATE` / `SHORT_L6_BY_STATE` trừ khi có quyết định redesign funding state.

## 5. CSV artefacts

- `docs/exports/near_backtest_90d.csv`
- `docs/exports/near_backtest_180d.csv`
- `docs/exports/near_backtest_365d.csv`
