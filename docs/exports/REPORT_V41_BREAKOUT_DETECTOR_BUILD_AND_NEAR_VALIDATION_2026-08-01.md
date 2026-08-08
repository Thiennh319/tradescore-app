# REPORT — V4.1 Breakout Detector Build & NEAR Validation

**Date:** 2026-08-01
**Symbol:** NEARUSDT · **Window:** 180d · **TF:** 1H
**Cost:** 0.18% RT (fee 0.08% + slip 0.10%)
**TP1 R:R:** 1.5 · **Max hold:** 80×1H
**Scope:** New detector only — TR/reversal untouched. No multi-symbol.

## 1. Detector (new)

- Code: `services/v41/breakoutDetector.ts` (+ unit tests).
- Range: Donchian N bars **before** breakout candle (N∈{20,30,40} in sweep configs).
- Consolidation (independent paths):
  - **Width:** `(rangeHigh−rangeLow)/rangeLow < X%`
  - **BB:** `getBollingerAnalysisV3` → `bandwidthSlope === CONTRACTING` for M consecutive bars before breakout
- Breakout: 1H **close** > rangeHigh (LONG) or < rangeLow (SHORT).
- Confirm A **immediate:** `computeMomentum1H` confirmed same side at breakout bar.
- Confirm B **retest:** touch broken level ±0.5% within 10×1H, then momentum at retest bar.
- Entry = active close; SL = opposite range ±0.3% buffer; TP = 1.5R.
- **Not used:** Market State Accumulation/Distribution.

## 2. Parameter configs (3–4 combos, not full factorial)

| Config | Mode | N | X% / M |
|--------|------|---|--------|
| W_N20_X5 | width | 20 | X=5% |
| W_N30_X5 | width | 30 | X=5% |
| W_N40_X8 | width | 40 | X=8% |
| BB_N30_M5 | bb_contracting | 30 | M=5 |

Each config × **A immediate** / **B retest**.

## 3. Results — NEAR 180d

| Config | Confirm | n | WR% | WR@fee% | E[R] gross | E[R] after fee | Sign | mean SL% |
|--------|---------|---|-----|---------|------------|----------------|------|----------|
| W_N20_X5 | immediate | 35 | 29.17 | 29.17 | -0.271 | -0.310 | negative | 4.88 |
| W_N20_X5 | retest | 15 | 33.33 | 33.33 | -0.167 | -0.202 | negative | 5.48 |
| W_N30_X5 | immediate | 15 | 30.00 | 30.00 | -0.250 | -0.289 | negative | 5.00 |
| W_N30_X5 | retest | 6 | 0.00 | 0.00 | -1.000 | -1.038 | negative | 5.55 |
| W_N40_X8 | immediate | 30 | 21.43 | 21.43 | -0.464 | -0.495 | negative | 7.18 |
| W_N40_X8 | retest | 9 | 0.00 | 0.00 | -1.000 | -1.032 | negative | 7.20 |
| BB_N30_M5 | immediate | 9 | 20.00 | 20.00 | -0.500 | -0.528 | negative | 7.71 |
| BB_N30_M5 | retest | 2 | 0.00 | 0.00 | -1.000 | -1.021 | negative | 7.46 |

### A vs B (paired)

| Config | n_A | WR_A | E[R]_A fee | n_B | WR_B | E[R]_B fee |
|--------|-----|------|------------|-----|------|------------|
| W_N20_X5 | 35 | 29.17 | -0.310 | 15 | 33.33 | -0.202 |
| W_N30_X5 | 15 | 30.00 | -0.289 | 6 | 0.00 | -1.038 |
| W_N40_X8 | 30 | 21.43 | -0.495 | 9 | 0.00 | -1.032 |
| BB_N30_M5 | 9 | 20.00 | -0.528 | 2 | 0.00 | -1.021 |

## 4. Preliminary observations

- **Frequency:** Usable for logic validation. Best sample is **W_N20_X5 immediate n=35** (~1 signal / 5 days). Retest cuts sample ~2× (15). BB path is thinner (n=9 / 2). Not “zero-signal rare” like early CVD-flip TR, but still modest for stable WR.
- **Edge:** All 8 runs **E[R] after fee &lt; 0**. With TP1=1.5R, breakeven WR ≈ 40%; observed WR ≈ 20–33% on decided exits → structure/momentum gate alone is not enough on NEAR-180d.
- **A vs B:** On the only apples-to-apples pair with decent n (**W_N20_X5**), retest has slightly better WR (33% vs 29%) and less-negative E[R] (−0.20 vs −0.31) but fewer trades. Other retest configs collapse to n≤9 with 0% WR — **not reliable yet**. Prefer **keep both paths**; next iteration should prioritize **A (immediate)** for sample size, and treat **B** as optional filter once n grows (multi-symbol / looser width).
- **Width vs BB:** Width N=20 X=5% dominates frequency. BB CONTRACTING M=5 is stricter and worse here — keep separate; do not AND with width yet.
- **Caveats:** Independent signals (no position deconflict); TIMEOUT excluded from E[R]; Market State Acc/Dist intentionally unused.

## 5. Artefacts

- `services/v41/breakoutDetector.ts`
- `services/v41/__tests__/breakoutDetector.test.ts`
- `scripts/backtest-v41-breakout-near-180d.ts`
- `docs/exports/v41-breakout-near-180d.csv`
- `docs/exports/v41-breakout-near-180d-trades.csv`
- `docs/exports/v41-breakout-near-180d-summary.json`

*End of report.*
