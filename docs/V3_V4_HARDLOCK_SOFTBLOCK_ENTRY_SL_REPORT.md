# TradeScore — Báo cáo V3/V4: Hard Lock, Soft Block, Entry & SL

**Phiên bản app:** 1.0.5  
**Engine:** Scorer V3 + V4 (tab Signal Board, mặc định V4)  
**Ngày export:** 2026-07-05  

---

## Mục lục

1. [Thuật ngữ: Hard Lock vs Soft Block](#1-thuật-ngữ-hard-lock-vs-soft-block)
2. [Luồng quyết định tổng thể](#2-luồng-quyết-định-tổng-thể)
3. [Hard Lock — nguyên nhân & tiêu chí mở khóa](#3-hard-lock--nguyên-nhân--tiêu-chí-mở-khóa)
4. [Soft Block — nguyên nhân & tiêu chí mở khóa](#4-soft-block--nguyên-nhân--tiêu-chí-mở-khóa)
5. [Cảnh báo (Warning) — không chặn nhưng hiển thị](#5-cảnh-báo-warning--không-chặn-nhưng-hiển-thị)
6. [FinalEntryStatus — thứ tự ưu tiên UI](#6-finalentrystatus--thứ-tự-ưu-tiên-ui)
7. [Đặt Entry theo chỉ số (V3 = V4 chung)](#7-đặt-entry-theo-chỉ-số-v3--v4-chung)
8. [Đặt SL theo chỉ số (V3 vs V4)](#8-đặt-sl-theo-chỉ-số-v3-vs-v4)
9. [Pipeline scan — thứ tự áp dụng](#9-pipeline-scan--thứ-tự-áp-dụng)
10. [So sánh V3 vs V4](#10-so-sánh-v3-vs-v4)
11. [Bảng tra cứu nhanh](#11-bảng-tra-cứu-nhanh)
12. [Map file code](#12-map-file-code)

---

## 1. Thuật ngữ: Hard Lock vs Soft Block

Trong codebase **không có tên `hardlock` / `softblock`**. UI và engine dùng:

| Khái niệm user | Trong code | `FinalEntryStatus` | Có vào lệnh? |
|---------------|------------|-------------------|--------------|
| **Hard lock** | `hardBlocks[]` + ADX CHOPPY | `HARD_BLOCKED` | Không |
| **Soft block — nhóm** | `groupBlocks[]` | `GROUP_BLOCKED` | Không |
| **Soft block — điểm** | `decision` thấp / `CHO_TAI_CHAM` | `SCORE_BLOCKED` | Không |
| **Soft block — chờ plan** | `tradePlanValid = false` | `WAIT_ENTRY` | Chưa (chờ giá/plan) |
| **Cảnh báo** | `warnings[]`, `squeezeWarning` | Vẫn `ENTRY_VALID` | Có thể (có cảnh báo) |

**Hard lock** = chặn cứng do vi phạm layer bắt buộc, BTC/Funding/CVD cực đoan, phiên xấu (kèm block khác), tâm lý, ADX CHOPPY cả 1H+4H.

**Soft block** = chặn “mềm” hơn: nhóm điểm chưa đủ min, tổng điểm < 9, chờ tái chấm L9 (V4), plan/R:R chưa đạt, hướng mơ hồ Long/Short.

---

## 2. Luồng quyết định tổng thể

```
Quét thị trường (signalBoardScan.ts)
    │
    ├─ scoreAnalysisV3() / scoreAnalysisV4()
    │     ├─ hardBlocks[]     per LONG / SHORT
    │     ├─ groupBlocks[]    per LONG / SHORT
    │     ├─ warnings[]       per LONG / SHORT
    │     └─ decision         SETUP_NGON … KHONG_VAO / CHO_TAI_CHAM (V4)
    │
    ├─ calculateTradePlanV3 / calculateTradePlanV4
    │     ├─ calculateOptimalEntry()
    │     ├─ calculateOptimalSL()  (+ resolveV4SlMultiplier ở V4)
    │     └─ blockReasons[] (R:R, entry MISS, ADX…)
    │
    ├─ evaluateADXGate() → scale SL/TP hoặc HARD BLOCK CHOPPY
    ├─ applyVWAPEntryToPlan() (V4 plan — chỉ entry)
    ├─ calculateStructureSL() → có thể override SL xa hơn
    │
    ├─ computeFinalEntryStatusForSide() → FinalEntryStatus
    └─ resolveDirectionAmbiguity() → có thể canEnter = false
```

**Thứ tự ưu tiên chặn (cao → thấp):**

1. Hard block (layer hoặc ADX CHOPPY cả 1H+4H)
2. Group block (Nhóm A/B/C < min)
3. Score / decision (`KHONG_VAO`, `CHO_THEM`, `CHO_TAI_CHAM`)
4. Trade plan chưa hợp lệ → `WAIT_ENTRY`
5. Đủ tất cả → `ENTRY_VALID`

---

## 3. Hard Lock — nguyên nhân & tiêu chí mở khóa

Ngưỡng hằng số: `constants/scoring.ts` → `HARD_BLOCK_RULES_V3` / `HARD_BLOCK_RULES_V4`.

### 3.1 L3 MACD vi phạm (V3 & V4)

| | |
|---|---|
| **Điều kiện** | L3 raw score **< 1** (≈ 0 điểm) |
| **Message** | `L3 MACD vi phạm — {reason}` |
| **LONG** | Histogram âm cả 1H & 4H, không có tín hiệu bẻ góc |
| **SHORT** | Histogram dương cả 1H & 4H |
| **Mở khóa** | MACD 1H/4H thuận hướng → L3 ≥ 1 → hardBlock biến mất ở scan tiếp theo |

**Code — chấm L3:**

```275:318:services/scorerV3.ts
export function scoreL3V3(
  direction: Direction,
  macd1h: MACDAnalysisV3,
  macd4h: MACDAnalysisV3,
): LayerResultV3 {
  // ...
  if (direction === 'LONG') {
    // score 2, 1.5, 1 … hoặc 0 "Histogram âm cả 2 khung — VI PHẠM"
  }
  // SHORT đối xứng
}
```

**Code — gắn hard block:**

```780:782:services/scorerV3.ts
    if (l3.score < 1) {
      hardBlocks.push(`L3 MACD vi phạm — ${l3.reason}`);
    }
```

**Ngoại lệ hiển thị (Locked Plan):** khi giá gần vùng entry + Plan Health ≠ CRITICAL, UI có thể **ẩn** L3 MACD khỏi danh sách hiển thị (không xóa khỏi snapshot gốc):

```87:105:services/tradePlanDisplay.ts
/**
 * L3 MACD là chỉ báo lagging… ẨN riêng lý do L3 MACD khỏi hardBlocks hiển thị
 * (không xóa khỏi snapshot gốc — chỉ lọc tại tầng hiển thị này).
 */
function shouldSuppressMacdBlock(
  isNearEntryZone: boolean | undefined,
  lockedPlanHealthStatus: HardBlockSnapInput['lockedPlanHealthStatus'],
): boolean {
  if (!isNearEntryZone) return false;
  if (lockedPlanHealthStatus == null) return false;
  return lockedPlanHealthStatus !== 'CRITICAL';
}
```

---

### 3.2 L5a CVD — chỉ V4

| Rule | Điều kiện | Message |
|------|-----------|---------|
| **Long CVD hard** | `classifyCvdState = STRONG_BEARISH` **và** giá **< EMA20** | `CVD deeply negative and still deteriorating.` |
| **Short CVD hard** | CVD > **+2,000,000** | `CVD +XM > +2M — chặn Short hoàn toàn` |
| **L5a score < 1** | Không đủ CVD thuận (không bị rule trên) | `L5a CVD chưa đủ 1đ — …` |

**STRONG_BEARISH:** CVD < -20M **và** momentum 24h < -3M (không phải RECOVERING).

```995:1018:services/indicators.ts
export function classifyCvdState(currentCvd: number, cvdMomentum24h: number): CvdState {
  if (currentCvd < CVD_STATE_DEEP_NEGATIVE) {
    if (cvdMomentum24h > CVD_STATE_MOMENTUM_RECOVERING) return CvdState.RECOVERING;
    if (cvdMomentum24h < CVD_STATE_MOMENTUM_STRONG_BEARISH) return CvdState.STRONG_BEARISH;
    return CvdState.BEARISH;
  }
  return CvdState.NEUTRAL;
}

export function evaluateLongCvdHardBlock(input: { ... }): string | null {
  if (classifyCvdState(...) !== CvdState.STRONG_BEARISH) return null;
  if (input.currentPrice >= input.ema20) return null;
  return 'CVD deeply negative and still deteriorating.';
}
```

**Mở khóa:** CVD cải thiện / giá hồi trên EMA20 (Long) hoặc CVD Short giảm dưới +2M.

**V3:** CVD nằm trong L5 chung (Volume/OI/CVD), **không** có hard block CVD riêng như V4.

---

### 3.3 L6 Funding squeeze (V3 & V4)

| Hướng | Điều kiện | Ngưỡng |
|-------|-----------|--------|
| **Chặn LONG** | `extremeRisk === 'LONG_SQUEEZE'` | Funding rate > **+0.03%** |
| **Chặn SHORT** | `extremeRisk === 'SHORT_SQUEEZE'` | Funding rate < **-0.03%** |

```1573:1599:services/indicators.ts
export function getFundingAnalysisV3(...): FundingAnalysisV3 {
  const extremeRisk =
    current > 0.03 ? 'LONG_SQUEEZE' : current < -0.03 ? 'SHORT_SQUEEZE' : 'NONE';
}
```

```486:506:services/scorerV3.ts
  if (direction === 'LONG' && extremeRisk === 'LONG_SQUEEZE') {
    return { ..., hardBlock: `Funding ${currentRate.toFixed(4)}% quá cao — chặn Long` };
  }
  if (direction === 'SHORT' && extremeRisk === 'SHORT_SQUEEZE') {
    return { ..., hardBlock: `Funding ${currentRate.toFixed(4)}% quá thấp — chặn Short` };
  }
```

**Mở khóa:** Funding về vùng bình thường (|rate| ≤ 0.03%).

---

### 3.4 L8 BTC momentum (V3 & V4)

| Rule | Điều kiện |
|------|-----------|
| Chặn **cả 2 hướng** | \|BTC 24h\| > **8%** |
| Chặn **LONG** alt | BTC 24h ≤ **-2%** |
| Chặn **SHORT** alt | BTC 24h ≥ **+2%** |

```608:622:services/scorerV3.ts
  if (Math.abs(change24h) > HARD_BLOCK_RULES_V3.BTC_EXTREME_PCT) {
    blockReasons.push(`BTC biến động ${change24h.toFixed(2)}% — quá rủi ro, chặn cả 2 chiều`);
  }
  if (direction === 'LONG' && change24h <= HARD_BLOCK_RULES_V3.BTC_LONG_BLOCK_PCT) {
    blockReasons.push(`BTC ${change24h.toFixed(2)}% ≤ -2% — chặn Long alt`);
  }
  // SHORT tương tự +2%
```

**Mở khóa:** BTC 24h về vùng cho phép (scan tiếp theo).

---

### 3.5 L9 Phiên giao dịch (V3 & V4)

| | |
|---|---|
| **Hard block** | L9 score **< 0.5** (thường = 0 — Asia Dead Zone 02–08h VN) |
| **Message** | `L9 Phiên xấu — {sessionName}: {reason}` |

Phiên tốt (London Open, NY Peak…) score 1.5–2 → không block.

**V4 đặc biệt — CHỜ TÁI CHẤM (soft, xem §4.3):** nếu **chỉ** L9 block và bỏ L9 vẫn đủ `CO_THE_VAO` → `awaitingRescore`, không hard block vĩnh viễn.

```1214:1223:services/scorerV4.ts
    if (
      l9Bad &&
      isOnlyL9SessionBlock(hardBlocks) &&
      wouldPassWithoutL9(groupBlocks, hardBlocks, referenceTotalScore)
    ) {
      awaitingRescore = true;
      decision = 'CHO_TAI_CHAM';
      // officialTotalScore = null
    }
```

**Mở khóa L9 hard thường:** vào phiên có score ≥ 0.5 (sau 08h VN hoặc phiên NY/London).

---

### 3.6 L10 Tâm lý (V3 & V4)

| | |
|---|---|
| **Hard block** | L10 score **< 1** (checklist V3 chưa đủ) |
| **Message** | `L10 Tâm lý chưa sẵn sàng` |
| **Checklist** | alert, chartStudied, noFomo, slTpReady, riskAccepted |

**Mở khóa:** tick đủ checklist trên UI Settings → L10 ≥ 1.

**TẠM TẮT (comment — TODO production):**

- Thua **≥ 3 lệnh liên tiếp / 24h** → cooldown **180 phút**
- Lỗ ngày **≥ 3 USDT** → chặn giao dịch

```694:716:services/scorerV3.ts
  // TODO: BẬT LẠI KHI PRODUCTION
  // if (todayStats.lossStreakLocked) { ... hardBlock cooldown ... }
  // if (todayStats.dailyLossUSDT >= MAX_DAILY_LOSS_USDT) { ... }
```

---

### 3.7 ADX Gate — HARD BLOCK độc lập (V3 & V4)

| | |
|---|---|
| **Hard block** | ADX **CHOPPY cả 1H và 4H** (`bothChoppy`) |
| **Message** | `⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ` |
| **Code flag** | `mandatoryViolations` thêm `ADX_CHOPPY`, `canEnter = false` |

```41:50:services/adxGate.ts
  if (adxData.bothChoppy) {
    return {
      allowed: false,
      block: true,
      message: '⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ',
      severity: 'BLOCK',
    };
  }
```

**Mở khóa:** ít nhất một khung thoát CHOPPY (TRENDING/RANGING rõ).

---

### 3.8 Hướng mơ hồ Long vs Short

| | |
|---|---|
| **Điều kiện** | \|longScore − shortScore\| < **1.0** điểm **2 scan liên tiếp** |
| **Kết quả** | `isAmbiguousDirection = true`, `canEnter = false` |
| **Mở khóa** | Chênh lệch ≥ 1.0 điểm **2 scan liên tiếp** (hysteresis) |

```28:30:services/directionAmbiguity.ts
 * Hysteresis 2-scan: vào AMBIGUOUS sau 2 lần sát nhau liên tiếp;
 * thoát sau 2 lần rõ ràng liên tiếp.
```

---

## 4. Soft Block — nguyên nhân & tiêu chí mở khóa

### 4.1 Group Block (Nhóm A / B / C)

Ba nhóm quy đổi về tối đa **5 điểm/nhóm**, tổng **15 điểm**:

| Nhóm | Layers V3 | Layers V4 | Raw max | Min bắt buộc |
|------|-----------|-----------|---------|--------------|
| **A — Xu hướng** | L1–L4 | L1–L4 | 8 | **≥ 2.5** |
| **B — Dòng tiền** | L5, L6, L7 | L5a, L5b, L6, L7 | 8 | **≥ 2.0** |
| **C — Bối cảnh** | L8, L9, L10 | L8, L9, L10 | 6 | **≥ 2.0** |

```829:844:services/scorerV3.ts
    if (groupA < SCORING_GROUPS_V3.GROUP_A_TREND.minRequired) {
      groupBlocks.push(`Nhóm A (Xu hướng) ${groupA.toFixed(1)}/5đ < 2.5đ`);
    }
    // B, C tương tự
```

**Mở khóa:** scan tiếp theo khi raw layer cải thiện → group score đạt min.

**Lưu ý V4:** `signalBoardScan` có thể **cập nhật động** group B khi OI/volume thay đổi giữa các lần quét (`updateGroupBBlocks`).

---

### 4.2 Score Block — điểm / nhãn decision

Ngưỡng (`resolveDecision` — khi không bị hard/group block):

| Điểm tổng | Nhãn | Vào lệnh? |
|-----------|------|-----------|
| ≥ 11.5 | SETUP_NGON | Có |
| ≥ 10.0 | VAO_TU_TIN | Có |
| ≥ 9.0 | CO_THE_VAO | Có (ngưỡng UI tối thiểu) |
| ≥ 8.0 | CHO_THEM | Không |
| < 8.0 | KHONG_VAO | Không |

```849:855:services/scorerV3.ts
    if (!isBlocked) {
      if (totalScore >= 11.5) decision = 'SETUP_NGON';
      else if (totalScore >= 10) decision = 'VAO_TU_TIN';
      else if (totalScore >= 9) decision = 'CO_THE_VAO';
      else if (totalScore >= 8) decision = 'CHO_THEM';
    }
```

**canEnter:**

```907:914:services/scorerV3.ts
export function canEnterV3(active: DirectionalScoreV3): boolean {
  return (
    active.hardBlocks.length === 0 &&
    active.groupBlocks.length === 0 &&
    active.decision !== 'KHONG_VAO' &&
    active.decision !== 'CHO_THEM'
  );
}
```

V4 thêm: `!awaitingRescore`, `decision !== 'CHO_TAI_CHAM'`.

**Mở khóa:** điểm hướng đó ≥ 9 và không còn hard/group block.

---

### 4.3 CHỜ TÁI CHẤM (V4 only — soft wait)

| | |
|---|---|
| **Khi nào** | Chỉ block L9, các nhóm OK, nếu bỏ L9 vẫn ≥ CO_THE_VAO |
| **Trạng thái** | `awaitingRescore = true`, `decision = CHO_TAI_CHAM`, `officialTotalScore = null` |
| **UI** | Không hiển thị điểm chính thức; badge chờ phiên |
| **Mở khóa** | Vào phiên L9 ≥ 0.5 → hard block L9 biến mất → tái chấm bình thường |

---

### 4.4 WAIT_ENTRY — Trade Plan chưa valid (soft chờ)

Không phải hard block đỏ. Scoring có thể đủ điểm nhưng plan chưa an toàn:

| blockReasons (plan) | Ý nghĩa |
|---------------------|---------|
| `R:R X:1 < tối thiểu 2:1` | SL/TP sau ADX/Structure khiến R:R < 2 |
| `Giá đã bỏ lỡ vùng entry tối ưu` | `entryZone.quality === 'MISS'` |
| `ADX_CHOPPY` | Plan bị đánh dấu khi ADX block |

```629:643:services/tradePlanV3.ts
  if (primaryRR < CFG.MIN_RR_TO_ENTER) {
    blockReasons.push(`R:R ${primaryRR.toFixed(2)}:1 < tối thiểu 2:1 — không vào`);
  }
  if (entryZone.quality === 'MISS') {
    blockReasons.push('Giá đã bỏ lỡ vùng entry tối ưu');
  }
```

**Mở khóa:** giá về vùng entry + R:R ≥ 2 sau recalc plan (scan tiếp hoặc giá di chuyển).

```15:28:services/finalEntryStatus.ts
export function calculateFinalEntryStatus(...): FinalEntryStatus {
  if (hardBlock) return FinalEntryStatus.HARD_BLOCKED;
  if (groupBlock) return FinalEntryStatus.GROUP_BLOCKED;
  if (SCORE_BLOCKED_DECISIONS.has(scoringDecision)) {
    return FinalEntryStatus.SCORE_BLOCKED;
  }
  if (!tradePlanValid) return FinalEntryStatus.WAIT_ENTRY;
  return FinalEntryStatus.ENTRY_VALID;
}
```

---

## 5. Cảnh báo (Warning) — không chặn nhưng hiển thị

| Nguồn | Ví dụ | Block? |
|-------|-------|--------|
| L1 | `L1 chưa đủ 2đ` | Không (chỉ warning) |
| L7 L/S ratio | Ratio > 3 hoặc < 0.5 — squeeze risk | Không |
| L8 BTC | BTC 24h xanh nhưng 1H quay đầu | Không |
| L5a CVD V4 | Phân kỳ ngược, RECOVERING penalty | Không (trừ hard rule §3.2) |
| Plan | Win prob < 65%, entry RISKY, SL TIGHT | Không |
| L11 Squeeze | EXTREME + ENTRY_VALID → `squeezeWarning` trên modal | Không |
| ADX 1 khung CHOPPY | TP ×0.9, SL ×1.1 | Không |

**CVD RECOVERING (soft penalty V4):**

```1024:1037:services/indicators.ts
export function applyRecoveringCvdLocalPenalty(...): {
  score: Math.max(0, score - CVD_RECOVERING_SCORE_PENALTY),
  warning: CVD_RECOVERING_SOFT_WARNING,
}
```

---

## 6. FinalEntryStatus — thứ tự ưu tiên UI

| Status | Label UI | Màu | Pulse |
|--------|----------|-----|-------|
| `HARD_BLOCKED` | HARD BLOCK 🚫 | #EF4444 | Có |
| `GROUP_BLOCKED` | CHẶN NHÓM ⛔ | #FCA5A5 | Không |
| `SCORE_BLOCKED` | KHÔNG VÀO | #6B7280 | Không |
| `WAIT_ENTRY` | SETUP TỐT — CHỜ ENTRY 🎯 | #F97316 | Không |
| `ENTRY_VALID` | SETUP NGON / VÀO TỰ TIN / CÓ THỂ VÀO | Xanh/vàng | Không |

---

## 7. Đặt Entry theo chỉ số (V3 = V4 chung)

Hàm: `calculateOptimalEntry()` — `services/tradePlanV3.ts`  
Dùng **chung** cho V3 và V4.

### Input chính

- `direction`, `currentPrice`
- EMA 1H (`ema20`)
- `atr` (14 nến 1H)
- `score.decision` → **ENTRY_PATIENCE** (% pullback chờ)
- `supports` / `resistances` (swing 1H/4H, EMA, whale)
- `whaleWalls`

### ENTRY_PATIENCE theo decision

| Decision | Chờ pullback |
|----------|----------------|
| SETUP_NGON | 0.2% |
| VAO_TU_TIN | 0.4% |
| CO_THE_VAO | 0.6% |
| CHO_THEM | 1.0% |

```898:903:constants/scoring.ts
  ENTRY_PATIENCE: {
    SETUP_NGON: 0.2,
    VAO_TU_TIN: 0.4,
    CO_THE_VAO: 0.6,
    CHO_THEM: 1.0,
  } as const,
```

### Logic ưu tiên LONG (SHORT đối xứng)

1. **Pullback EMA20:** giá cách EMA20 **0.5%–5%** → entry = `ema20 + 0.2×ATR`
2. **Gần support STRONG/MEDIUM:** entry từ `srEntryFromLevel` + entry buffer (max 0.3%, min ATR×0.25, cap 0.5%)
3. **Fallback:** chờ pullback `%patience` từ giá hiện tại

```186:207:services/tradePlanV3.ts
  if (direction === 'LONG') {
    const distToEMA = ((currentPrice - ema20) / currentPrice) * 100;
    if (distToEMA > 0.5 && distToEMA < 5) {
      const optimal = ema20 + atr * 0.2;
      // quality GOOD / ACCEPTABLE / RISKY theo khoảng cách
    }
```

### Entry quality → block plan

| Quality | Plan |
|---------|------|
| GOOD / ACCEPTABLE | OK |
| RISKY | warning |
| MISS | soft block `Giá đã bỏ lỡ vùng entry tối ưu` |

### VWAP overlay (sau plan V4)

`applyVWAPEntryToPlan()` — gợi ý entry gần VWAP session nếu lý tưởng; **không đổi SL**.

---

## 8. Đặt SL theo chỉ số (V3 vs V4)

### 8.1 Pipeline SL (cả V3 & V4)

1. `calculateOptimalSL()` — SL gốc
2. `scaleTradePlanByAdxGate()` — nhân SL theo regime ADX
3. `calculateStructureSL()` + `applyStructureSlToPlan()` — có thể **đẩy SL xa hơn** theo swing 4H

### 8.2 calculateOptimalSL — hàm chung

**ATR multiplier theo decision (V3):**

| Decision | × ATR |
|----------|-------|
| SETUP_NGON | 1.5 |
| VAO_TU_TIN | 2.0 |
| CO_THE_VAO | 2.5 |
| CHO_THEM | 3.0 |

**Market mode factor:**

| Mode | slFactor |
|------|----------|
| TRENDING | 0.9 (chặt hơn 10%) |
| RANGING | 1.1 (rộng hơn 10%) |

**Công thức LONG cơ bản:**

```
atrDistance = atr × atrMult × slFactor
slCandidate = entry - atrDistance
```

**Case ưu tiên (LONG):**

| Case | Chỉ số | SL |
|------|--------|-----|
| **ATR_BASED** | ATR 1H, decision, marketMode | entry − atrDistance |
| **STRUCTURE_BASED** | Support STRONG trong ±0.5×ATR của slCandidate | support − 0.3×ATR |
| **WHALE_PROTECTED** | Bid wall giữa entry và SL | wall − 0.2×ATR |
| **CAP** | Mọi case | Max **4×ATR** từ entry |

```346:375:services/tradePlanV3.ts
  if (direction === 'LONG') {
    let slCandidate = entry - atrDistance;
    const supportBelow = supports.find(
      (s) => s.price < slCandidate && s.price > slCandidate - atr * 0.5 && s.strength === 'STRONG',
    );
    if (supportBelow) {
      slCandidate = supportBelow.price - atr * 0.3;
      slType = 'STRUCTURE_BASED';
    }
    const wallCheck = findWallProtectingSL(slWhaleWalls.bidWalls, slCandidate, 'LONG');
    if (wallCheck.isSafe && wallCheck.wall) {
      slCandidate = wallCheck.wall.price - atr * 0.2;
      slType = 'WHALE_PROTECTED';
    }
    if (entry - slCandidate > atr * 4) {
      slCandidate = entry - atr * 4;
    }
```

### 8.3 V4 — resolveV4SlMultiplier (thêm so với V3)

Khi setup **mạnh nhờ CVD** nhưng Group A chỉ vừa đủ:

- `Group A ≤ 2.8` **và** L5a raw mạnh **và** decision VAO_TU_TIN/SETUP_NGON
- → profile `CVD_DOMINANT`: **giảm** atrMult thêm `CVD_SL_TIGHTEN` (SL chặt hơn V3 cùng điểm)

```153:168:services/tradePlanV4.ts
  const adjustedMultiplier = Math.max(
    1.0,
    +(baseMultiplier - CFG_V4.CVD_SL_TIGHTEN).toFixed(2),
  );
  return {
    profile: 'CVD_DOMINANT',
    slMultiplierNote: `SL ${adjustedMultiplier}×ATR (setup mạnh nhờ CVD, trend vừa đủ…)`,
  };
```

### 8.4 ADX scale SL/TP

| ADX | SL mult | TP mult | Block? |
|-----|---------|---------|--------|
| CHOPPY cả 1H+4H | — | — | **HARD** |
| 1 khung CHOPPY | ×1.1 | ×0.9 | Warning |
| RANGING | ×1.1 | ×0.85 | Warning |
| TRENDING STRONG | ×0.9 | ×1.2 | Bonus |

### 8.5 Structure SL 4H (overlay cuối)

- Swing low/high 4H (lookback 20 nến, neighbor 2)
- Buffer **0.3%** qua swing
- `slSource`: `STRUCTURE` | `ATR_FALLBACK`
- **Có thể xa hơn** SL gốc nếu swing 4H cũ — đây là lý do SL hay “xa” trên UI

File: `services/structureSL.ts` → `calculateStructureSL()`

---

## 9. Pipeline scan — thứ tự áp dụng

```860:954:services/signalBoardScan.ts
      tradePlanV3Scorer = calculateTradePlanV3(...);
      tradePlanV4Scorer = calculateTradePlanV4(...);
      // ADX scale
      if (adxGate.tpMultiplier !== 1.0 || adxGate.slMultiplier !== 1.0) {
        planV3Final = scaleTradePlanByAdxGate(planV3Final, adxGate);
        planV4Final = scaleTradePlanByAdxGate(planV4Final, adxGate);
      }
      planV4Final = applyVWAPEntryToPlan(planV4Final, vwapData, directionV4);
      // Structure SL
      const structureApplied = applyStructureSLToPlans(...);
      v4Final = enrichSnapshotFinalStatus(v4Base, planV4Final, hardBlocks, groupBlocks, ...);
      if (adxGate.block) {
        v4Final = applyAdxBlockToSnapshot(v4Final);
      }
```

---

## 10. So sánh V3 vs V4

| Khía cạnh | V3 | V4 |
|-----------|----|----|
| L5 | Volume+OI+CVD gộp | **L5a CVD** + **L5b Volume/OI** |
| Hard CVD | Không | Long STRONG_BEARISH+EMA20, Short > +2M |
| L6 Funding | Legacy trend scoring | + funding velocity/state (L6 detail) |
| L9 block đặc biệt | Luôn hard nếu score < 0.5 | **CHO_TAI_CHAM** nếu chỉ L9 |
| Squeeze L11 | Không | `squeezeRisk` + warning EXTREME |
| SL | Chỉ ATR/structure/whale | + **CVD_DOMINANT** tighten |
| canEnter | Không `CHO_TAI_CHAM` | + `!awaitingRescore` |

Logic hard block L3, L6 squeeze, L8 BTC, L9, L10, group A/B/C: **giống nhau** về ngưỡng.

---

## 11. Bảng tra cứu nhanh

| Triệu chứng / Message | Loại | Mở khóa khi |
|------------------------|------|-------------|
| L3 MACD vi phạm | HARD | MACD thuận hướng L3 ≥ 1 |
| L5a CVD / CVD > +2M | HARD (V4) | CVD + giá cải thiện |
| Funding chặn Long/Short | HARD | \|funding\| ≤ 0.03% |
| BTC ±8% / Long ≤-2% / Short ≥+2% | HARD | BTC 24h về vùng an toàn |
| L9 Phiên xấu (+ block khác) | HARD | Vào phiên score ≥ 0.5 |
| L9 chỉ một mình (V4) | SOFT (CHO_TAI_CHAM) | Phiên tốt → tái chấm |
| L10 Tâm lý | HARD | Checklist đủ |
| Nhóm A/B/C < min | GROUP | Layer nhóm cải thiện |
| Điểm < 9 / CHO_THEM | SCORE | Điểm ≥ 9 |
| R:R < 2 / entry MISS | WAIT | Giá + plan recalc OK |
| ADX CHOPPY 1H+4H | HARD | ADX thoát CHOPPY |
| Long vs Short sát | AMBIGUOUS | Chênh ≥ 1đ × 2 scan |
| L7 L/S extreme | WARNING | — |
| Squeeze EXTREME | WARNING | — |

---

## 12. Map file code

| Chức năng | File |
|-----------|------|
| Scorer V3, hard/group blocks | `services/scorerV3.ts` |
| Scorer V4, CHO_TAI_CHAM | `services/scorerV4.ts` |
| Ngưỡng, groups, trade plan config | `constants/scoring.ts` |
| FinalEntryStatus UI | `services/finalEntryStatus.ts` |
| Trade plan entry/SL/TP | `services/tradePlanV3.ts` |
| Trade plan V4 + SL profile | `services/tradePlanV4.ts` |
| ADX gate | `services/adxGate.ts` |
| Scan pipeline | `services/signalBoardScan.ts` |
| Ambiguity Long/Short | `services/directionAmbiguity.ts` |
| CVD hard block / session / funding | `services/indicators.ts` |
| Structure SL 4H | `services/structureSL.ts` |
| UI block reasons | `services/tradePlanDisplay.ts` |
| Signal row V3/V4 view | `services/signalRowView.ts` |
| UI Signal Board | `components/dashboard/SignalBoard.tsx` |

---

## Tài liệu liên quan (cùng repo)

- `docs/SCORING_ENTRY_LOGIC_REPORT.txt` — logic vào lệnh chi tiết (v1.0.3)
- `docs/SL_LOGIC_V3_V4_REPORT.txt` — SL / Structure SL sâu hơn
- `docs/POSITION_ADVISOR_V4_REPORT.md` — cảnh báo **khi đã mở lệnh** (khác entry block)

---

*Báo cáo sinh từ source tree v1.0.5 — đối chiếu trực tiếp `scorerV3.ts`, `scorerV4.ts`, `tradePlanV3.ts`, `finalEntryStatus.ts`, `adxGate.ts`, `signalBoardScan.ts`.*
