# WHALE DIAGNOSTIC REPORT

**Date:** 2026-06-15  
**Scope:** V3/V4 production whale logic (excludes `services/v41/`)  
**Mode:** Read-only analysis — no code, config, or test changes  

**Question:** BTC `minNotionalUSD = 5_000_000` is already set, but whale signals still appear too frequently. **Why?**

---

## Executive Summary

Raising BTC notional to **$5M** only affects the **Whale Radar alert pipeline** (`whaleRadarDetect.ts`). It does **not** govern most other “whale” outputs users see in scoring, trade plan reasoning, key levels, or L7/L11.

The full anti-spoof config in `WHALE_SYMBOL_CONFIG` (`minAgeSeconds`, `minExecutedRatio`, `maxRefreshCount`, `maxDistanceATR`) is implemented in `whaleRadarValidation.ts` but **`filterValidWhaleWalls()` is never called** from production scoring or radar paths. Radar alerts use only **notional + strength (37.5×)** and snapshot diff rules that can re-fire on **≥50% size growth** and **every large pull**.

**Primary root cause:** Two whale definitions coexist — strict radar ($5M, 37.5×) vs permissive scoring/plan (**3× strength, no $5M check**). User-perceived “whale frequency” is often from the **permissive path**, not the $5M gate.

---

# 1. Current BTC Whale Config

From `constants/whaleRadar.ts` → `WHALE_SYMBOL_CONFIG.BTCUSDT`:

| Parameter | Value |
|-----------|-------|
| **minNotionalUSD** | **5_000_000** |
| **minAgeSeconds** | **180** (3 minutes) |
| **minExecutedRatio** | **0.10** (10%) |
| **maxRefreshCount** | **2** |
| **maxDistanceATR** | **0.30** |

Related globals (same file):

| Parameter | Value | Used where |
|-----------|-------|------------|
| WHALE_MIN_STRENGTH | 37.5× | Radar only |
| WHALE_MIN_DISTANCE_ATR | 0.10 | Scoring/plan ATR band (min) |
| WHALE_RADAR_INTERVAL_MS | 5 min | Scan interval |
| WHALE_PULL_RATIO | 0.30 | Pull = drop below 30% of prior size |

---

# 2. Where Are Whale Signals Generated?

## A. Whale Radar — user alerts (toast + sound + OS notification)

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/whaleRadarScan.ts` | `runWhaleRadarScan` | Orchestrates 5-min scan for BTC/BNB/SOL/NEAR |
| `services/whaleRadarScan.ts` | `scanSymbol` | Fetches order book → heatmap → walls → events |
| `services/whaleRadarDetect.ts` | `extractWallsFromHeatmap` | Filters walls: notional ≥ $5M (BTC), strength ≥ 37.5× |
| `services/whaleRadarDetect.ts` | `detectWhaleRadarEvents` | Emits `WALL_PLACED` / `WALL_PULLED` vs previous snapshot |
| `services/whaleRadarNotification.ts` | `notifyWhaleRadarEvents` | Dedupe same scan; OS notifications |
| `services/whaleRadarNotification.ts` | `playWhaleEventAlarms` | In-app alarm (always on event) |
| `hooks/useWhaleRadar.ts` | `useWhaleRadar` | 5-min interval + toast stack (max 4, 12s TTL) |
| `components/WhaleRadarToast.tsx` | UI component | Displays radar toasts |
| `services/periodicTradingWork.ts` | background work | Calls `runWhaleRadarScanIfDue` |
| `App.tsx` | mount | Wires `useWhaleRadar` + toast UI |

## B. Scoring / trade plan — whale walls (no toast; affects score & plan text)

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/indicators.ts` | `calculateLiquidityHeatmap` | Builds order-book pools (5× avg volume threshold) |
| `services/indicators.ts` | `detectWhaleWalls` | Classifies pools as walls if **strength ≥ 3** (default) |
| `services/indicators.ts` | `buildEntryWhaleWalls` | Maps walls → bid/ask + `distancePct` |
| `services/whaleEntryWalls.ts` | `buildWhaleEntryWalls` | Adds **ATR distance band** filter only |
| `services/whaleConfirmation.ts` | `scoreL7FlowWithWhaleConfirmation` | L7 +0.5 when L/S slope + nearby wall |
| `services/whaleConfirmation.ts` | `appendWhaleConfirmationToEntryReasoning` | Appends “Whale Bid/Ask Wall … xác nhận setup” |
| `services/whaleConfirmation.ts` | `resolveWhaleWallsForEntry` | V4: strips walls if no base EMA/S/R setup |
| `services/whaleMarketBehavior.ts` | `resolveWhaleWallsForConfirmation` | Empty walls in RANGING |
| `services/whaleMarketBehavior.ts` | `resolveWhaleWallsForStopProtection` | Empty walls in RANGING for SL |
| `services/scorerV3.ts` | `buildAnalysisInputFromMarket` | Builds `whaleWalls` via `buildWhaleEntryWalls` |
| `services/scorerV4.ts` | `scoreAnalysisV4` | Same + L11 squeeze whale component |
| `services/tradePlanV3.ts` | `finalizeEntryZone` | Appends whale reasoning (no price change) |
| `services/tradePlanV4.ts` | `calculateTradePlanV4Native` | Entry gate + shared V3 finalize |
| `services/signalBoardScan.ts` | scan path | Builds whale walls for board |

## C. Key levels — whale support / resistance classification

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/indicators.ts` | `getKeyLevels` | Pushes each bid wall → SUPPORT (`source: WHALE_WALL`); ask → RESISTANCE |
| `services/indicators.ts` | `getKeyLevelsCached` | Cached key levels; refreshes whale wall slice |
| `services/indicators.ts` | `whaleWallsToKeyLevels` | Converts walls to key level entries |

## D. SL protection

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/indicators.ts` | `evaluateWhaleWallSLSafety` | Checks whale behind SL |
| `services/indicators.ts` | `isWallProtectingSL` | Directional wall vs SL price |
| `services/tradePlanV3.ts` | `calculateOptimalSL` | May set `WHALE_PROTECTED` SL type |

## E. L11 squeeze (V4 only)

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/scorerV4.ts` | `resolveSqueezeWhaleWall` | Nearest wall + **distancePct** (not ATR) |
| `services/squeezeRiskEngine.ts` | squeeze scoring | `whaleWallConfirmation` 1–2 pts by **% distance** |

## F. Legacy entry type (NOT V3/V4 production path)

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/indicators.ts` | `calculateEntryZone` | Can return **`WALL_SUPPORT`** entry type/price |
| `services/scorer.ts` | legacy scorer | Still uses `calculateEntryZone` |

**Note:** `WALL_RESISTANCE` **does not exist** in the codebase. Ask-side whale walls use `WALL_SUPPORT` (legacy) or `WHALE_WALL` + `RESISTANCE` (key levels).

## G. Implemented but NOT wired to production

| FILE | FUNCTION | PURPOSE |
|------|----------|---------|
| `services/whaleRadarValidation.ts` | `filterValidWhaleWalls` | Full anti-spoof (age, executed ratio, refresh, ATR, notional) — **tests only** |
| `services/whaleRadarValidation.ts` | `isValidWhaleWall` | Same rules — **not called** from radar or scorers |

---

# 3. Daily Signal Estimate (BTC)

**Method:** Analytical estimate from scan cadence + event rules (no live Binance telemetry in this report).

**Assumptions:**

- App open / background worker active → scan every **5 minutes** → **288 scans/day**
- Whale Radar compares **previous vs current snapshot** per symbol
- BTC deep book often has **multiple** $5M+ resting walls within ~0.3–1% of price during normal/high vol
- `WALL_PLACED` fires on: (a) new `priceKey`+side, or (b) same wall **notional grows ≥50%**
- `WALL_PULLED` fires when wall gone or notional **< 30%** of prior
- Scoring path re-evaluates on **each analysis/scan** (signal board, manual refresh) — separate from radar cadence
- User may also see whale in **L7 reasoning, key levels, trade plan text** without any radar toast

### BTC Whale **Radar** alerts / day (toast + alarm)

| Regime | Estimated events/day (BTC only) | Rationale |
|--------|----------------------------------|-----------|
| **Conservative market** | **5 – 15** | Few new $5M walls; stable book; mostly occasional pulls |
| **Normal market** | **15 – 40** | Several buckets qualify; size oscillation crosses 50% threshold; some pulls |
| **High volatility** | **40 – 100+** | Frequent place/pull cycles; spoof-like pulls near price; multiple adjacent price keys |

**All 4 radar symbols combined:** multiply roughly ×2–×3 vs BTC-only if user watches global toasts (BNB/SOL/NEAR lower notional thresholds).

### BTC **Scoring / UI whale mentions** / day (non-radar)

| Regime | Relative frequency | Rationale |
|--------|-------------------|-----------|
| **Conservative** | Low–medium | minStrength **3×** still picks several heatmap pools; ATR band may keep 1–3 walls |
| **Normal** | **Medium–high** | Many pools pass 3×; key levels show multiple `WHALE_WALL` S/R; L7 text if setup exists |
| **High volatility** | **High** | Book churn → walls enter/exit ATR band on each analysis refresh |

**Important:** Scoring frequency is **not capped at 288/day** — tied to how often user/scanner runs `scoreAnalysisV3/V4` or signal board refresh.

---

# 4. Whale Validation Pipeline

## Documented ideal pipeline (from `WHALE_SYMBOL_CONFIG` + `whaleRadarValidation.ts`)

```
RAW ORDERBOOK
    ↓
MIN SIZE CHECK (minNotionalUSD = $5M BTC)
    ↓
AGE FILTER (minAgeSeconds = 180)
    ↓
EXECUTED RATIO FILTER (minExecutedRatio = 0.10)
    ↓
REFRESH COUNT FILTER (maxRefreshCount = 2)
    ↓
ATR DISTANCE FILTER (0.10 – 0.30 ATR for BTC)
    ↓
FINAL WHALE SIGNAL
```

## Actual code paths (two pipelines)

### Path A — **Whale Radar alerts** (what triggers 🐋 toast)

```
RAW ORDERBOOK (fetchDeepOrderBook)
    ↓
calculateLiquidityHeatmap
    │  clusterLevels → bucket volume
    │  pool if volume ≥ 5× book average (LIQ_MULTIPLIER=5)
    ↓
extractWallsFromHeatmap
    │  ✓ ORDERBOOK_WALL only
    │  ✓ strength ≥ 37.5 (WHALE_MIN_STRENGTH)
    │  ✓ notionalUsd ≥ $5M (WHALE_MIN_NOTIONAL_USD)
    │  ✗ NO age filter
    │  ✗ NO executed ratio
    │  ✗ NO refresh count
    │  ✗ NO ATR distance
    ↓
detectWhaleRadarEvents(prevSnapshot, currSnapshot)
    │  WALL_PLACED: new priceKey OR notional ≥ 1.5× previous
    │  WALL_PULLED: wall gone OR notional < 30% previous
    │  Spoof score on pull only (proximity %, short-lived) — informational
    ↓
notifyWhaleRadarEvents / useWhaleRadar toasts
    │  Dedupe: same scan only (alertLockKey)
    │  ✗ NO cross-scan cooldown
```

**Files:** `whaleRadarScan.ts` → `indicators.ts` (heatmap) → `whaleRadarDetect.ts` → `whaleRadarNotification.ts` → `useWhaleRadar.ts`

### Path B — **V3/V4 scoring, plan, key levels** (most “whale” UI/score)

```
RAW ORDERBOOK / liquidityPools (from analysis fetch)
    ↓
calculateLiquidityHeatmap (same 5× avg threshold)
    ↓
detectWhaleWalls(pools, minStrength = 3)    ← 12.5× LOWER bar than radar
    │  ✗ NO minNotionalUSD check
    ↓
buildEntryWhaleWalls → bid/ask + distancePct
    ↓
filterEntryWhaleWallsByDistance (whaleEntryWalls.ts)
    │  ✓ ATR band [0.10, maxDistanceATR] — **if symbol passed correctly**
    │  ✗ NO age / executed / refresh (filterValidWhaleWalls NOT called)
    ↓
Consumers:
    • scoreL7FlowWithWhaleConfirmation (+0.5)
    • appendWhaleConfirmationToEntryReasoning
    • getKeyLevels → WHALE_WALL support/resistance
    • calculateOptimalSL → WHALE_PROTECTED
    • resolveSqueezeWhaleWall (V4, uses distancePct)
```

**Files:** `scorerV3.ts` / `scorerV4.ts` → `whaleEntryWalls.ts` → `whaleConfirmation.ts` / `indicators.ts`

### Config fields vs reality

| Config field | Radar alerts | Scoring/plan |
|--------------|-------------|--------------|
| minNotionalUSD $5M | **YES** | **NO** |
| minAgeSeconds 180 | **NO** | **NO** (not wired) |
| minExecutedRatio 0.10 | **NO** | **NO** (not wired) |
| maxRefreshCount 2 | **NO** | **NO** (not wired) |
| maxDistanceATR 0.30 | **NO** | **Partial** (ATR band only) |

---

# 5. Possible Reasons For Excessive Signals

## A) Is minAgeSeconds too low?

**Current (config):** 180 seconds (3 min)  
**Effective in production:** **∞ (not applied)** — radar and scoring never call age filter  

**Recommended (if wired):** **300 – 600 s** for BTC (5–10 min) to ignore flicker walls  

**Impact today:** **None** — explains why raising notional alone did not reduce noise enough.

---

## B) Is minExecutedRatio too low?

**Current (config):** 0.10 (10%)  
**Effective in production:** **Not applied** (requires trade-flow metadata not available in heatmap path)  

**Recommended (if wired):** **0.15 – 0.25** for BTC spoof-prone zones  

**Impact today:** **None**

---

## C) Is maxRefreshCount too high?

**Current (config):** 2  
**Effective in production:** **Not applied**  

**Recommended (if wired):** **1** for BTC (stricter refresh = spoof)  

**Impact today:** **None**

---

## D) Is maxDistanceATR too permissive?

**Current (config):** 0.30 ATR (BTC)  
**Effective in production:**  
- Scoring/plan: **YES** via `filterEntryWhaleWallsByDistance`  
- Radar: **NO** (distance irrelevant for alerts)  
- **Bug/ gap:** `scoreL7FlowWithWhaleConfirmation` and `appendWhaleConfirmationToEntryReasoning` often called **without `symbol`** → defaults to **NEARUSDT 0.5 ATR** (wider than BTC 0.3) → **more** L7/reasoning hits  

**Recommended:** **0.20 – 0.25 ATR** for BTC; **always pass symbol**  

**Impact today:** **Medium** on scoring/reasoning; **zero** on radar toasts

---

## E) Are duplicate whale walls emitted repeatedly? (e.g. 5.1M / 5.2M / 5.3M same zone)

**Clustering in heatmap:** `clusterLevels` merges into **price buckets** (~$1 for BTC typical)  
**Radar priceKey:** `priceKeyForWall` rounds to **$0.10** for BTC ≥ 10k — finer than bucket center  

**Separate alerts for adjacent levels:** **YES**  
- Each distinct `side:priceKey` is a separate wall  
- First appearance → `WALL_PLACED`  
- Notional growth ≥50% on same key → **another** `WALL_PLACED`  
- Multiple qualifying buckets within 0.3% of mark → **multiple parallel “whales”**  

**Merge nearby walls in code:** **NO** (no clustering step in radar or `buildWhaleEntryWalls`)

**Answer: YES** — duplicate / near-duplicate emissions are possible and likely in active books.

---

## F) Are old whale walls removed properly?

**Snapshot state:** **YES** — `saveWhaleRadarSnapshot` replaces per-symbol wall list; walls not in current book drop from snapshot  

**Pull detection:** **YES** — `WALL_PULLED` when wall absent or <30% size  

**Side effect:** Each removal generates **another alert** (pull toast/alarm) → contributes to **high event count** in volatile markets  

**Answer: YES** for lifecycle tracking; **NO** for “silent removal” (pulls are signaled, not suppressed)

---

## Additional root causes (not in A–F checklist)

| # | Cause | Severity |
|---|-------|----------|
| G | **Dual threshold:** radar 37.5× + $5M vs scoring **3×, no $5M** | **Critical** |
| H | **50% growth re-alert** on same price (`detectWhaleRadarEvents`) | **High** for radar |
| I | **No cross-scan cooldown** (only same-scan dedupe) | **High** for radar |
| J | **WALL_PULLED** alerts on every large disappearance | **Medium–High** in vol |
| K | **4 symbols** scanned; user may perceive BTC+alt noise | **Medium** |
| L | L11 squeeze still uses **distancePct** (1%/3%), not ATR | **Low–Medium** (V4) |

---

# 6. Recommendation

**DO NOT IMPLEMENT** — recommendations only.

### Options (as requested)

| Option | Description |
|--------|-------------|
| **A** | Raise BTC threshold further (e.g. $7M–$10M notional +/or strength > 37.5×) |
| **B** | Increase age requirement (wire `minAgeSeconds`; suggest 300–600s BTC) |
| **C** | Increase executed ratio (wire when data available; suggest 0.15–0.25) |
| **D** | Reduce ATR distance (BTC 0.30 → 0.20–0.25; fix missing `symbol` in L7) |
| **E** | Merge nearby whale walls (cluster within X ATR or $Y before alert/score) |

### Rank by expected impact on “too frequent” signals

| Rank | Option | Why |
|------|--------|-----|
| **1** | **Wire full validation + unify thresholds** (B+C+E + apply $5M to scoring path) | Config values exist but **don't run**; scoring uses **3×** without notional — biggest gap vs user expectation |
| **2** | **E — Merge nearby walls** | Stops 5.1M/5.2M/5.3M-style duplicate radar events and multiple `WHALE_WALL` key levels |
| **3** | **Fix radar re-fire rules** (50% growth + no cooldown + pull alerts) | Directly reduces toast/alarm count without raising $5M again |
| **4** | **D — Reduce ATR distance + pass symbol** | Cuts scoring/reasoning/L7 noise; fixes NEAR-default-wider-band bug for BTC |
| **5** | **A — Raise BTC threshold further** | Helps radar only; **marginal** if book routinely has several $5M+ walls; **no effect** on scoring path |

### Suggested investigation order (when coding resumes)

1. Confirm **which signal type** user counts (toast vs L7 vs key levels vs plan text).  
2. If radar: tune **growth threshold**, **cooldown**, **wall merge** before raising $5M again.  
3. If scoring/UI: apply **$5M + 37.5×** (or shared helper) in `buildWhaleEntryWalls` / `detectWhaleWalls`.  
4. Wire **`filterValidWhaleWalls`** or drop unused config to avoid false confidence.  
5. Pass **`symbol`** into all L7/reasoning calls for correct BTC 0.30 ATR band.

---

## Appendix — Test coverage reference

| File | Covers |
|------|--------|
| `services/whaleRadarDetect.test.ts` | Place/pull, 50% growth, persistence |
| `services/whaleRadarValidation.test.ts` | Full pipeline rules (not wired) |
| `services/whaleConfirmation.test.ts` | L7 ATR, entry gate |
| `services/whaleEntryWalls.test.ts` | Market-hugging filter |
| `services/entryZone.test.ts` | Legacy WALL_SUPPORT only |

**Gap:** No test asserting V3/V4 never emit whale-priced entries after refactor; no integration test for daily alert rate.

---

*End of report — read-only diagnostic, no files modified except this document.*
