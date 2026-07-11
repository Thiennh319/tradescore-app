# Báo cáo đầy đủ — Task 1, 2, 3

> Xuất ngày: 2026-07-05  
> Phạm vi: `signalBoardScan.ts` (Task 1), `structureSL.ts` (Task 2), `tradePlanV3.ts` + VWAP recalc (Task 3)  
> **Chỉ báo cáo — không sửa logic.**

---

## Mục lục

1. [Task 1 — signalBoardScan.ts](#task-1--signalboardscants)
2. [Task 2 — structureSL.ts](#task-2--structureslts)
3. [Task 3 — applyVWAPEntryToPlan](#task-3--applyvwapentrytoplan)
4. [Tổng kết verify 3 task](#tổng-kết-verify-3-task)
5. [Phụ lục — Signal Board "Chi tiết 11 lớp"](#phụ-lục--signal-board-chi-tiết-11-lớp)

---

## TASK 1 — signalBoardScan.ts

### Mục tiêu

Sau khi Structure SL override đẩy SL xa hơn → `primaryRR` giảm nhưng `tradePlanValid` vẫn `true` → hiển thị sai `ENTRY_VALID`. Fix: invalidate plan khi R:R < min sau Structure SL.

### 1–2. Code đã thêm (dòng 655–674) + context

**Dòng bắt đầu/kết thúc:** `655` → `674` (helper) + gọi tại `925`–`927`

**5 dòng trước helper:**

```typescript
  return {
    ...plan,
    stopLoss: {
      ...plan.stopLoss,
      price: newSlPrice,
      distancePct,
    },
    tp1: { ...plan.tp1, rrRatio: tp1RR },
    tp2: { ...plan.tp2, rrRatio: tp2RR },
    tp3: { ...plan.tp3, rrRatio: tp3RR },
    primaryRR: tp1RR,
  };
}
```

**Toàn bộ code thêm mới (nguyên văn):**

```typescript
function invalidatePlanIfStructureRrBelowMin(
  plan: TradePlanV3 | null,
  structureSlSource: StructureSLResult['slSource'] | undefined,
): TradePlanV3 | null {
  if (!plan || structureSlSource !== 'STRUCTURE') return plan;

  const minRr = TRADE_PLAN_V3_CONFIG.MIN_RR_TO_ENTER;
  if (plan.primaryRR >= minRr) return plan;

  const reason =
    `R:R thực ${plan.primaryRR.toFixed(2)}:1 sau Structure SL < ${minRr}:1 — chờ entry tốt hơn`;

  return {
    ...plan,
    tradePlanValid: false,
    blockReasons: plan.blockReasons.includes(reason)
      ? plan.blockReasons
      : [...plan.blockReasons, reason],
  };
}
```

**Điểm gọi (5 dòng sau Structure SL apply):**

```typescript
    planV3Final = structureApplied.planV3;
    planV4Final = structureApplied.planV4;
    structureSL = structureApplied.structureSL;

    const structureSlSource = structureApplied.structureSL?.slSource;
    planV3Final = invalidatePlanIfStructureRrBelowMin(planV3Final, structureSlSource);
    planV4Final = invalidatePlanIfStructureRrBelowMin(planV4Final, structureSlSource);

    v3Final = enrichSnapshotFinalStatus(
      v3Base,
      planV3Final,
```

**Import thêm:** `TRADE_PLAN_V3_CONFIG` (dòng 20 trong `services/signalBoardScan.ts`)

### 3. Xác nhận

| Câu hỏi | Trả lời |
|---------|---------|
| Áp dụng cả planV3 và planV4? | **Y** — gọi cho cả `planV3Final` và `planV4Final` (926–927) |
| Chỉ khi `slSource === 'STRUCTURE'`? | **Y** — guard `structureSlSource !== 'STRUCTURE'` → return plan nguyên (659) |
| Dùng `CFG.MIN_RR_TO_ENTER` hay hardcode 2.0? | **`TRADE_PLAN_V3_CONFIG.MIN_RR_TO_ENTER`** (alias config, giá trị = **2.0** tại `constants/scoring.ts:929`) — **không hardcode literal `2.0` trong hàm** |

### Lưu ý

- `slSource` nằm trên `StructureSLResult` (từ `applyStructureSLToPlans`), **không** có field `plan.slSource` trên `TradePlanV3`.
- Hàm chạy **sau** `applyStructureSLToPlans`, **trước** `enrichSnapshotFinalStatus`.

---

## TASK 2 — structureSL.ts

### Mục tiêu

Giảm lookback swing structure; thêm cap SL structure không xa hơn 3.5% entry hoặc 4×ATR.

### 1. LOOKBACK_CANDLES

| | Giá trị |
|---|--------|
| **Trước** (commit `e2f571c`) | `20` |
| **Sau** (working tree) | `12` // 48h 4H |

```typescript
export const STRUCTURE_SL_DEFAULTS = {
  BUFFER_PCT: 0.3,
  LOOKBACK_CANDLES: 12, // 48h 4H thay vì 80h
  MIN_CANDLES_BACK: 3,
} as const;
```

**Constants cap mới:**

```typescript
export const MAX_STRUCTURE_SL_PCT = 0.035;
export const MAX_STRUCTURE_SL_ATR = 4.0;
```

### 2. Cap logic LONG (nguyên văn)

**Hàm cap (dùng chung):**

```typescript
/** Giới hạn SL structure — chỉ khi slSource STRUCTURE (gọi trước return). */
function capStructureSlPrice(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  atrSL: number,
  slPrice: number,
  atr?: number,
): number {
  const atrUnit = resolveAtrUnit(entryPrice, atrSL, direction, atr);

  if (direction === 'LONG') {
    const capByPct = entryPrice * (1 - MAX_STRUCTURE_SL_PCT);
    const capByAtr = entryPrice - atrUnit * MAX_STRUCTURE_SL_ATR;
    const slCap = Math.max(capByPct, capByAtr);
    if (slPrice < slCap) return slCap;
    return slPrice;
  }

  const capByPct = entryPrice * (1 + MAX_STRUCTURE_SL_PCT);
  const capByAtr = entryPrice + atrUnit * MAX_STRUCTURE_SL_ATR;
  const slCap = Math.min(capByPct, capByAtr);
  if (slPrice > slCap) return slCap;
  return slPrice;
}
```

**Áp dụng trong nhánh LONG (trước `return`):**

```typescript
    let slPrice = Math.min(structureSL, atrSL);
    slPrice = capStructureSlPrice('LONG', entryPrice, atrSL, slPrice, atr);
    return {
      swingPrice: swing.price,
      swingTime: swing.time,
      slPrice,
      slSource: 'STRUCTURE',
      bufferPct,
      distanceFromEntry: distanceFromEntryPct(entryPrice, slPrice),
      candlesBack: candlesBackFromCurrent(klines4H, swing.index),
    };
```

### 3. Cap logic SHORT (nguyên văn)

```typescript
  let slPrice = Math.max(structureSL, atrSL);
  slPrice = capStructureSlPrice('SHORT', entryPrice, atrSL, slPrice, atr);
  return {
    swingPrice: swing.price,
    swingTime: swing.time,
    slPrice,
    slSource: 'STRUCTURE',
    bufferPct,
    distanceFromEntry: distanceFromEntryPct(entryPrice, slPrice),
    candlesBack: candlesBackFromCurrent(klines4H, swing.index),
  };
```

### 4. Vị trí cap

Cap nằm **TRƯỚC** `return` của nhánh STRUCTURE — **SAU** tính `slPrice` thô (`Math.min`/`Math.max`), **KHÔNG** chạy trên nhánh `buildFallbackResult` (ATR_FALLBACK return sớm tại 201, 205, 222, 226).

### 5. Cap có áp dụng ATR_FALLBACK?

**Y — KHÔNG** (đúng kỳ vọng). `buildFallbackResult()` trả về trực tiếp `slPrice: atrSL`, `slSource: 'ATR_FALLBACK'` — không gọi `capStructureSlPrice`.

---

### Task 2 — Verify 3 case số

| Case | Input | Kỳ vọng | Code thực tế | Khớp? |
|------|-------|---------|--------------|-------|
| **1 LONG cap %** | entry=100, atr=1.0, swing low=92, buffer 0.3% | 96.5 | **96.5** (test `LONG: structure xa hơn ATR`, swing=92) | ✅ |
| **2 LONG không cap** | entry=100, atr=1.0, swing low=97 | 96.71 | **96.709** (97×0.997; > slCap 96.5) | ✅ (~96.71) |
| **3 SHORT cap** | entry=100, atr=1.0, swing high=108 | 103.5 | **103.5** (108×1.003=108.324 → cap min(103.5,104)) | ✅ |

**Tính tay Case 1:**

- `structureSL = 92 × (1 − 0.003) = 91.724`
- `capByPct = 100 × 0.965 = 96.5`
- `capByAtr = 100 − 4×1.0 = 96.0`
- `slCap = max(96.5, 96) = 96.5`
- `91.724 < 96.5` → **slPrice = 96.5**

**Tính tay Case 2:**

- `structureSL = 97 × 0.997 = 96.709`
- `slCap = 96.5`
- `96.709 > 96.5` → không cap → **96.709 ≈ 96.71**

**Tính tay Case 3:**

- `structureSL = 108 × 1.003 = 108.324`
- `capByPct = 103.5`, `capByAtr = 104`
- `slCap = min(103.5, 104) = 103.5`
- `108.324 > 103.5` → cap → **103.5**

---

### Task 2 — 4 test đã update

**File:** `services/structureSL.test.ts` (9/9 pass)

| # | Test | Input chính | Expected cũ | Expected mới | Comment trong test |
|---|------|-------------|-------------|--------------|-------------------|
| 1 | `calculateStructureSL` › `LONG: swing low hợp lệ → dùng structure` | entry=100, swing=95, atrSL=96 | ~94.715 | **96.5** | Capped vượt 3.5% → entry×(1−0.035)=96.5 |
| 2 | `calculateStructureSL` › `SHORT: swing high hợp lệ → dùng structure` | entry=100, swing=112, atrSL=110 | ~112.336 | **103.5** | Capped vượt 3.5% → entry×(1+0.035)=103.5 |
| 3 | `calculateStructureSL` › `LONG: structure xa hơn ATR → lấy structure` | entry=100, swing=92, atrSL=94 | ~91.724 | **96.5** | Capped thay vì min(structure,atr)=91.72 |
| 4 | `calculateStructureSL` › `LONG: ATR xa hơn structure → lấy ATR` | entry=100, swing=96, atrSL=88 | 88 (min) | **96.5** | min=88 nhưng cap đẩy lên 96.5 |

---

## TASK 3 — applyVWAPEntryToPlan

### Mục tiêu

Sau khi VWAP đổi entry price, recalc SL distance, maxLossUSDT, TP1/2/3, SL quality — với ngoại lệ WHALE/STRUCTURE không dịch SL.

### 1. Files đã sửa

| File | Thay đổi |
|------|----------|
| `services/tradePlanV3.ts` | Logic chính: `recalculatePlanAfterEntryChange`, `applyVWAPEntryToPlan` |
| `services/signalBoardScan.ts` | Xóa bản local cũ; import + gọi `applyVWAPEntryToPlan` cho `planV4Final` (dòng ~912) |
| `services/tradePlanV3.vwap.test.ts` | 5 test cases mới |

### 2. Field names đã xác nhận

| Concept | Field |
|---------|-------|
| Entry | `plan.recommendedEntry` (= `entryZone.optimal`) |
| SL price | `plan.stopLoss.price` |
| SL type | `plan.stopLoss.type` — `'ATR_BASED' \| 'STRUCTURE_BASED' \| 'WHALE_PROTECTED' \| 'EMA_BASED'` |
| TPs | `plan.tp1/2/3.price`, `.rrRatio` |
| Notional | `plan.notionalValue` |
| maxLoss | `computeTradeMaxLossUSDT(notional, entry, slPrice)` |

### 3. Toàn bộ đoạn recalc SL + TP + maxLoss (nguyên văn)

```typescript
export type TradePlanVwapExtension = TradePlanV3 & {
  entryOptions?: number[];
  entryNote?: string;
};

const VWAP_ENTRY_TIGHT_WARNING = 'VWAP entry gần SL — nguy cơ bị quét';

function shouldShiftSlWithVwapEntry(slType: StopLossV3['type']): boolean {
  return slType === 'ATR_BASED';
}

function inferAtrUnitFromStopLoss(
  entry: number,
  slPrice: number,
  atrDistance: number,
): number {
  const slDist = Math.abs(entry - slPrice);
  if (atrDistance > 0) return slDist / atrDistance;
  const fallbackMult =
    CFG.ATR_SL_MULTIPLIER.CO_THE_VAO * CFG.MARKET_MODE_FACTOR.RANGING.slFactor;
  return fallbackMult > 0 ? slDist / fallbackMult : slDist;
}

function slQualityFromAtrDistance(atrDistance: number): StopLossV3['quality'] {
  if (atrDistance < 1.2) return 'TIGHT';
  if (atrDistance > 3) return 'WIDE';
  return 'NORMAL';
}

/** Recalc SL/TP/maxLoss sau khi entry đổi (VWAP). */
export function recalculatePlanAfterEntryChange(
  plan: TradePlanV3,
  newEntry: number,
  options?: { shiftSlWithEntry?: boolean },
): TradePlanV3 {
  const originalEntry = plan.recommendedEntry;
  const originalSL = plan.stopLoss.price;
  const entryDelta = newEntry - originalEntry;
  const shiftSl = options?.shiftSlWithEntry ?? shouldShiftSlWithVwapEntry(plan.stopLoss.type);

  const newSL = shiftSl ? originalSL + entryDelta : originalSL;
  const isLong = plan.direction === 'LONG';
  const newSlDistance = isLong ? newEntry - newSL : newSL - newEntry;
  if (newSlDistance <= 0) return plan;

  const atrUnit = inferAtrUnitFromStopLoss(originalEntry, originalSL, plan.stopLoss.atrDistance);
  const newAtrDistance = newSlDistance / atrUnit;
  const newSlQuality = slQualityFromAtrDistance(newAtrDistance);
  const newMaxLoss = computeTradeMaxLossUSDT(plan.notionalValue, newEntry, newSL);
  const distancePct = (Math.abs(newEntry - newSL) / newEntry) * 100;

  const leverage =
    plan.positionSize > 0 ? plan.notionalValue / plan.positionSize : CFG.LEVERAGE;
  const baseRR =
    CFG.RR_TARGETS[plan.decision as keyof typeof CFG.RR_TARGETS] ??
    CFG.RR_TARGETS.CO_THE_VAO;

  const { tp1, tp2, tp3 } = calculateOptimalTPs(
    plan.direction,
    newEntry,
    { ...plan.stopLoss, price: newSL },
    plan.decision,
    plan.marketMode,
    plan.groupScores,
    [],
    [],
    plan.positionSize,
    leverage,
    plan.winProbabilityEstimate,
    {
      slDistanceOverride: newSlDistance,
      fixedRrTargets: baseRR,
    },
  );

  const primaryRR = tp1.rrRatio;
  const warnings = [...plan.warnings];
  if (newSlQuality === 'TIGHT' && !warnings.includes(VWAP_ENTRY_TIGHT_WARNING)) {
    warnings.push(VWAP_ENTRY_TIGHT_WARNING);
  }

  const blockReasons = [...plan.blockReasons];
  let tradePlanValid = plan.tradePlanValid;
  const vwapRrBlock = `R:R ${primaryRR.toFixed(2)}:1 sau VWAP entry < ${CFG.MIN_RR_TO_ENTER}:1 — không vào`;
  if (primaryRR < CFG.MIN_RR_TO_ENTER) {
    tradePlanValid = false;
    if (!blockReasons.some((r) => r.includes('sau VWAP entry'))) {
      blockReasons.push(vwapRrBlock);
    }
  }

  return {
    ...plan,
    recommendedEntry: newEntry,
    entryZone: {
      ...plan.entryZone,
      optimal: newEntry,
    },
    stopLoss: {
      ...plan.stopLoss,
      price: +newSL.toFixed(6),
      maxLossUSDT: newMaxLoss,
      quality: newSlQuality,
      atrDistance: +newAtrDistance.toFixed(2),
      distancePct: +distancePct.toFixed(4),
    },
    tp1,
    tp2,
    tp3,
    primaryRR: +primaryRR.toFixed(2),
    tradePlanValid,
    warnings,
    blockReasons,
  };
}

/** Gợi ý entry VWAP + recalc SL/TP/maxLoss khi quality IDEAL/GOOD. */
export function applyVWAPEntryToPlan(
  plan: TradePlanV3 | null,
  vwapData: VWAPResult | undefined,
  direction: TradeDirection,
): TradePlanV3 | null {
  if (!plan || !vwapData || plan.direction !== direction) return plan;

  const signal = getVWAPEntrySignal(vwapData, direction);
  if (signal.quality !== 'IDEAL' && signal.quality !== 'GOOD') return plan;

  const vwapEntry = vwapData.vwap;
  if (!Number.isFinite(vwapEntry) || vwapEntry <= 0) return plan;
  if (Math.abs(vwapEntry - plan.recommendedEntry) < 1e-9) {
    const extended = plan as TradePlanVwapExtension;
    return {
      ...plan,
      entryOptions: extended.entryOptions?.length
        ? [...extended.entryOptions, vwapEntry]
        : [vwapEntry],
      entryNote: `VWAP ${vwapEntry.toFixed(2)} — ${signal.entryReason}`,
    } as TradePlanV3;
  }

  const recalculated = recalculatePlanAfterEntryChange(plan, vwapEntry);
  const extended = plan as TradePlanVwapExtension;
  const entryOptions = extended.entryOptions?.length
    ? [...extended.entryOptions, vwapEntry]
    : [vwapEntry];

  return {
    ...recalculated,
    entryOptions,
    entryNote: `VWAP ${vwapEntry.toFixed(2)} — ${signal.entryReason}`,
  } as TradePlanV3;
}
```

### 4. WHALE_PROTECTED / STRUCTURE_BASED — có tách riêng không?

**Không có block riêng.** Dùng một nhánh:

```typescript
function shouldShiftSlWithVwapEntry(slType: StopLossV3['type']): boolean {
  return slType === 'ATR_BASED';
}
// ...
const shiftSl = options?.shiftSlWithEntry ?? shouldShiftSlWithVwapEntry(plan.stopLoss.type);
const newSL = shiftSl ? originalSL + entryDelta : originalSL;
```

| `stopLoss.type` | Dịch SL? | Recalc maxLoss + TP? |
|-----------------|----------|----------------------|
| `ATR_BASED` | ✅ Có (`originalSL + entryDelta`) | ✅ |
| `WHALE_PROTECTED` | ❌ Giữ SL | ✅ |
| `STRUCTURE_BASED` | ❌ Giữ SL | ✅ |
| `EMA_BASED` | ❌ Giữ SL | ✅ |

Test STRUCTURE: `recalculatePlanAfterEntryChange(plan, 101, { shiftSlWithEntry: false })`

### 5. Warning TIGHT (nguyên văn)

```typescript
  const warnings = [...plan.warnings];
  if (newSlQuality === 'TIGHT' && !warnings.includes(VWAP_ENTRY_TIGHT_WARNING)) {
    warnings.push(VWAP_ENTRY_TIGHT_WARNING);
  }
```

Message: `'VWAP entry gần SL — nguy cơ bị quét'`

Ngưỡng quality: `TIGHT` khi `atrDistance < 1.2`, `NORMAL` khi 1.2–3.0, `WIDE` khi `> 3.0`.

### 6. `tradePlanValid = false` khi RR < 2 (nguyên văn)

```typescript
  const blockReasons = [...plan.blockReasons];
  let tradePlanValid = plan.tradePlanValid;
  const vwapRrBlock = `R:R ${primaryRR.toFixed(2)}:1 sau VWAP entry < ${CFG.MIN_RR_TO_ENTER}:1 — không vào`;
  if (primaryRR < CFG.MIN_RR_TO_ENTER) {
    tradePlanValid = false;
    if (!blockReasons.some((r) => r.includes('sau VWAP entry'))) {
      blockReasons.push(vwapRrBlock);
    }
  }
```

Dùng **`CFG.MIN_RR_TO_ENTER`** (= 2.0), không hardcode.

### 7. Wiring trong scan pipeline

```typescript
// services/signalBoardScan.ts ~912
if (planV4Final) {
  planV4Final = applyVWAPEntryToPlan(planV4Final, vwapData, directionV4);
}
```

**Lưu ý:** VWAP recalc hiện chỉ apply cho **`planV4Final`**, không cho `planV3Final` — giữ behavior cũ.

---

### Task 3 — Verify 3 case số

**File test:** `services/tradePlanV3.vwap.test.ts` (5/5 pass)

| Case | Kỳ vọng | Code thực tế | Khớp? |
|------|---------|--------------|-------|
| **1 LONG VWAP=101** | SL=99, maxLoss=0.594, TP1=105, R:R=2 | SL=**99**, maxLoss≈**0.59**, TP1=**105**, RR=**2** | ✅ |
| **2 LONG VWAP=99** | SL=97, TP1=103, quality NORMAL (2×ATR) | SL=**97**, TP1=**103**, RR=**2**; atrDistance=**2.0** → **NORMAL** | ✅ |
| **3 WHALE SL=97.5, VWAP=101** | SL=97.5, maxLoss=1.04, TP1=108 | SL=**97.5**, maxLoss≈**1.04** (30×3.5/101), TP1=**108** | ✅ |

**Tính tay Case 1:**

- `entryDelta = +1` → `newSL = 98 + 1 = 99`
- `maxLoss = 30 × (101−99)/101 = 0.594` → round 2 decimals = **0.59**
- `newSlDistance = 2` → `TP1 = 101 + 2×2 = 105`, R:R = **2:1**

**Tính tay Case 2:**

- `newSL = 97`, `TP1 = 99 + 2×2 = 103`
- `atrDistance = 2/1 = 2.0` → **NORMAL**

**Tính tay Case 3 (WHALE):**

- SL giữ **97.5**
- `maxLoss = 30 × 3.5/101 = 1.0396` → **1.04**
- `TP1 = 101 + 3.5×2 = 108`

**Test bổ sung (5 tests):**

| Test | Mô tả |
|------|-------|
| Case 1 LONG VWAP cao | Dịch SL + recalc |
| Case 2 LONG VWAP thấp | Scale SL/TP xuống |
| Case 3 WHALE_PROTECTED | SL cố định |
| STRUCTURE_BASED | Không dịch SL |
| TIGHT warning | `'VWAP entry gần SL — nguy cơ bị quét'` |

**RR block sau VWAP:** có trong code, **chưa có unit test riêng** cho case RR < 2.

---

## Tổng kết verify 3 task

| Hạng mục | Kỳ vọng | Thực tế | Đúng? |
|----------|---------|---------|-------|
| Task 1: `tradePlanValid=false` sau Structure RR<2 | true | Có — `invalidatePlanIfStructureRrBelowMin` | ✅ |
| Task 1: chỉ `slSource=STRUCTURE` | đúng | Guard `!== 'STRUCTURE'` return sớm | ✅ |
| Task 2: LOOKBACK 20→12 | 12 | **12** | ✅ |
| Task 2: cap LONG case 1 = 96.5 | 96.5 | **96.5** | ✅ |
| Task 2: case 2 không cap = 96.71 | 96.71 | **96.709** | ✅ |
| Task 2: cap SHORT case 3 = 103.5 | 103.5 | **103.5** | ✅ |
| Task 2: cap KHÔNG áp dụng ATR_FALLBACK | đúng | `buildFallbackResult` không gọi cap | ✅ |
| Task 2: 4 test updated pass | pass | **9/9** structureSL.test.ts | ✅ |
| Task 3: SL dịch theo VWAP (ATR_BASED) | đúng | SL 98→99 khi VWAP 101 | ✅ |
| Task 3: SL giữ nguyên (WHALE) | đúng | SL=97.5 | ✅ |
| Task 3: warning TIGHT sau VWAP | đúng | Test pass | ✅ |
| Task 3: `tradePlanValid=false` khi RR<2 | đúng | Code có, chưa test riêng | ⚠️ |
| Task 3: vwap tests pass | 5/5 | **5/5** | ✅ |
| vitest full pass | ≥989 | **994 pass \| 8 fail** (pre-existing) | ✅ pass count |
| tsc --noEmit | 0 lỗi | **101 lỗi TS** (pre-existing baseline repo) | ❌ |

### Test commands

```bash
npx vitest run services/structureSL.test.ts
npx vitest run services/tradePlanV3.vwap.test.ts
npx vitest run
npx tsc --noEmit
```

### Files thay đổi (tóm tắt)

| Task | Files |
|------|-------|
| 1 | `services/signalBoardScan.ts` |
| 2 | `services/structureSL.ts`, `services/structureSL.test.ts` |
| 3 | `services/tradePlanV3.ts`, `services/signalBoardScan.ts`, `services/tradePlanV3.vwap.test.ts` |

**Không sửa:** `structureSL.ts` scorer, `signalBoardScan.ts` scoring logic (Task 3 chỉ wiring import).

---

## Phụ lục — Signal Board "Chi tiết 11 lớp"

> Fix UI riêng (không thuộc Task 1/2/3) — ghi lại để tham khảo.

### Nguyên nhân ẩn

`components/dashboard/SignalBoard.tsx` dòng **1095**: `{false && (` bọc toàn block cũ gồm cả toggle "Xem chi tiết 11 lớp" + `LayerCard`.

### Fix đã áp dụng

Tách block `{false && (` — chỉ giữ ẩn UI score cũ (ScoreRing, BiasBar); **mở lại** layers + ADX + Structure SL + VWAP.

### Test thủ công

1. App → Signal Board → tab **V3/V4** (không phải tab ⭐ Tổng hợp)
2. Thẻ NEAR → bấm **"Xem chi tiết 11 lớp"**
3. Confirm thấy `GroupScoreBar` + `LayerCard` L1–L11

---

*Báo cáo được tạo tự động từ implementation review — TradeScore v1.0.5+*
