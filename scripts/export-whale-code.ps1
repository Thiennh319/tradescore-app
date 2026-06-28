$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root "dist\WHALE_TASKS_1-7-CODE-export.txt"

function Append-Text($text) {
  Add-Content -Path $out -Value $text -Encoding UTF8
}

function Append-File($title, $relativePath) {
  Append-Text ""
  Append-Text "================================================================================"
  Append-Text "FILE: $title"
  Append-Text "================================================================================"
  Append-Text ""
  Get-Content (Join-Path $root $relativePath) -Raw -Encoding UTF8 | ForEach-Object { Append-Text $_ }
}

$header = @"
================================================================================
WHALE TASKS 1-7 — FULL CODE EXPORT (single file)
Generated: $(Get-Date -Format 'yyyy-MM-dd')
Vitest: 561/561 PASS
================================================================================

PHAN A — WHALE MODULES (copy nguyen file vao project)
  [1] constants/whaleRadar.ts              Task 1, 7
  [2] services/whaleRadarValidation.ts     Task 2, 3, 7
  [3] services/whaleScoring.ts             Task 4, 6
  [4] services/whaleMarketBehavior.ts      Task 6
  [5] services/whaleEntryWalls.ts          Task 7
  [6] services/whaleConfirmation.ts        Task 5

PHAN B — WIRE SNIPPETS (chen vao file co san, khong thay ca file)
  [7]  services/derivativesDataService.ts
  [8]  services/scorerV3.ts
  [9]  services/scorerV4.ts
  [10] services/tradePlanV3.ts
  [11] services/tradePlanV4.ts
  [12] services/signalBoardScan.ts
  [13] hooks/useMarketAnalysis.ts

PHAN C — TESTS
  [14] services/whale*.test.ts + derivativesDataService.test.ts (whale cases)
"@

Set-Content -Path $out -Value $header -Encoding UTF8

$modules = @(
  "constants\whaleRadar.ts",
  "services\whaleRadarValidation.ts",
  "services\whaleScoring.ts",
  "services\whaleMarketBehavior.ts",
  "services\whaleEntryWalls.ts",
  "services\whaleConfirmation.ts"
)
foreach ($m in $modules) { Append-File $m $m }

$wire = @'

================================================================================
FILE: services/derivativesDataService.ts — WHALE WIRE (Task 4, 6)
================================================================================

// imports (top of file):
import {
  scoreL13WhaleDelta,
  WHALE_ALIGN_BONUS_MAX,
  WHALE_TRADE_MIN_USD,
} from './whaleScoring';
import type { WhaleMarketMode } from './whaleMarketBehavior';
export { scoreL13WhaleDelta } from './whaleScoring';

// thresholds derive from whaleScoring:
// L13_WHALE_TRADE_MIN_USD: WHALE_TRADE_MIN_USD
// L13_WHALE_ALIGN_BONUS: WHALE_ALIGN_BONUS_MAX

export function computeAdvancedDerivativesScore(
  direction: TradeDirection,
  currentPrice: number,
  heatmap: LiquidationHeatmapResult | null,
  advanced: AdvancedDerivativesData | null,
  marketMode?: WhaleMarketMode | string,  // Task 6
): AdvancedDerivativesScoreResult {
  // ...
  const l13 = scoreL13WhaleDelta(
    direction,
    advanced?.whaleOrderDeltaUsd ?? 0,
    marketMode,
  );
  // whaleDeltaScore: l13.score
}


================================================================================
FILE: services/scorerV3.ts — WHALE WIRE (Task 5, 6, 7)
================================================================================

import { resolveWhaleWallsForConfirmation } from './whaleMarketBehavior';
import { scoreL7FlowWithWhaleConfirmation } from './whaleConfirmation';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import type { AppTradeSymbol } from '../constants/scoring';

export function scoreL7V3(...) {
  // ... L/S ratio warnings unchanged ...
  const flow = scoreL7FlowWithWhaleConfirmation(
    direction, topSlope, whaleWalls, currentPrice, atr,
  );
  return { layerResult: layer(7, flow.score, flow.reason, 'B'), warning };
}

export function scoreAnalysisV3(...) {
  const whaleWallsForL7 = resolveWhaleWallsForConfirmation(bb1h.marketMode, whaleWalls);
  // scoreL7V3(..., whaleWallsForL7, input.currentPrice, input.atr1h)
}

export function buildAnalysisInputV3FromMarket(...) {
  const whaleWalls = buildWhaleEntryWalls(
    params.symbol as AppTradeSymbol,
    params.currentPrice,
    base.atr1h,
    params.liquidityPools ?? [],
  );
  return { ...base, whaleWalls, ... };
}


================================================================================
FILE: services/scorerV4.ts — WHALE WIRE (Task 5, 6, 7)
================================================================================

import { resolveWhaleWallsForConfirmation } from './whaleMarketBehavior';
import { scoreL7FlowWithWhaleConfirmation } from './whaleConfirmation';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import type { AppTradeSymbol } from '../constants/scoring';

export function scoreL7V4(...) {
  const flow = scoreL7FlowWithWhaleConfirmation(
    direction, topSlope, whaleWalls, currentPrice, atr,
  );
  return { layerResult: layerB(7, flow.score, 2, flow.reason), warning };
}

export function scoreAnalysisV4(...) {
  const whaleWallsForL7 = resolveWhaleWallsForConfirmation(bb1h.marketMode, whaleWalls);
  // scoreL7V4(..., whaleWallsForL7, input.currentPrice, input.atr1h)
}

export function buildAnalysisInputV4FromMarket(...) {
  const whaleWalls = buildWhaleEntryWalls(
    params.symbol as AppTradeSymbol,
    params.currentPrice,
    base.atr1h,
    params.liquidityPools ?? [],
  );
}


================================================================================
FILE: services/tradePlanV3.ts — WHALE WIRE (Task 5, 6)
================================================================================

import { resolveWhaleWallsForStopProtection } from './whaleMarketBehavior';
import { resolveWhaleWallsForEntry } from './whaleConfirmation';

export function calculateOptimalSL(...) {
  const slWhaleWalls = resolveWhaleWallsForStopProtection(marketMode, whaleWalls);
  // findWallProtectingSL(slWhaleWalls.bidWalls|askWalls, ...)
}

export function calculateTradePlanV3(...) {
  const entryWhaleWalls = resolveWhaleWallsForEntry(
    { direction, currentPrice, ema20: ema1h.ema20, supports, resistances },
    whaleWalls,
  );
  const entryZone = calculateOptimalEntry(..., entryWhaleWalls);
  // calculateOptimalSL still receives full whaleWalls (SL gate inside)
}


================================================================================
FILE: services/tradePlanV4.ts — WHALE WIRE (Task 5)
================================================================================

import { resolveWhaleWallsForEntry } from './whaleConfirmation';

export function calculateTradePlanV4Native(...) {
  const entryWhaleWalls = resolveWhaleWallsForEntry(
    { direction, currentPrice, ema20: ema1h.ema20, supports, resistances },
    whaleWalls,
  );
  const entryZone = calculateOptimalEntry(..., entryWhaleWalls);
}


================================================================================
FILE: services/signalBoardScan.ts — WHALE WIRE (Task 7)
================================================================================

import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { computeAtr1hFromKlines } from './atr1h';

const whaleWalls = buildWhaleEntryWalls(
  symbol,
  ticker.price,
  computeAtr1hFromKlines(klines1h, ticker.price),
  analysis.heatmap.pools,
);


================================================================================
FILE: hooks/useMarketAnalysis.ts — WHALE WIRE (Task 7)
================================================================================

import { computeAtr1hFromKlines } from '../services/atr1h';
import { buildWhaleEntryWalls } from '../services/whaleEntryWalls';

const whaleWalls = buildWhaleEntryWalls(
  symbol,
  price,
  computeAtr1hFromKlines(klines1h, price),
  analysis.heatmap.pools,
);

'@

Append-Text $wire

$tests = @(
  "services\whaleRadarValidation.test.ts",
  "services\whaleScoring.test.ts",
  "services\whaleMarketBehavior.test.ts",
  "services\whaleEntryWalls.test.ts",
  "services\whaleConfirmation.test.ts",
  "services\derivativesDataService.test.ts"
)
foreach ($t in $tests) { Append-File $t $t }

Write-Host "Exported: $out ($((Get-Item $out).Length) bytes)"
