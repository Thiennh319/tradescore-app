$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$reportOut = Join-Path $root "dist\WHALE_REFACTOR-export.txt"
$codeOut = Join-Path $root "dist\WHALE_REFACTOR-CODE-export.txt"
$date = Get-Date -Format 'yyyy-MM-dd HH:mm'

function Append-Text($path, $text) {
  Add-Content -Path $path -Value $text -Encoding UTF8
}

function Append-File($path, $title, $relativePath) {
  Append-Text $path ""
  Append-Text $path "================================================================================"
  Append-Text $path "FILE: $title"
  Append-Text $path "================================================================================"
  Append-Text $path ""
  Get-Content (Join-Path $root $relativePath) -Raw -Encoding UTF8 | ForEach-Object { Append-Text $path $_ }
}

# --- REPORT ---
$report = @"
================================================================================
EXPORT — Whale Refactor (Tasks 1-7 + Entry Removal + ATR Proximity)
Generated: $date
================================================================================

KIEM TRA:
  npx vitest run (full project)  -> 563/563 PASS (75 files)

COMMITS DE XUAT:
  refactor(whale): remove whale-generated entries
  refactor(whale): replace percentage distance with ATR proximity

FILES MODIFIED (refactor moi):
  services/tradePlanV3.ts          — whale khong tao entry; finalizeEntryZone reasoning only
  services/whaleConfirmation.ts    — appendWhaleConfirmationToEntryReasoning; symbol-aware ATR
  services/whaleRadarValidation.ts   — getWhaleMaxProximityDistanceATR; isWhaleWithinProximityDistance

CODE EXPORT:
  dist/WHALE_REFACTOR-CODE-export.txt
  Regenerate: powershell -File scripts/export-whale-refactor.ps1

================================================================================
TOM TAT TIEN DO (Tasks 1-7 + Refactor)
================================================================================

  [OK] TASK 1  — Symbol-specific whale config (WHALE_SYMBOL_CONFIG)
  [OK] TASK 2  — Strict whale validation (isValidWhaleWall)
  [OK] TASK 3  — Anti-spoof filters
  [OK] TASK 4  — L13 whale max score +0.5 (khong +1.5)
  [OK] TASK 5  — Confirmation-only layer
  [OK] TASK 6  — Disable whale in RANGING
  [OK] TASK 7  — Min distance 0.10 ATR (anti market-hugging)
  [OK] REFACTOR A — Remove whale-generated entries (calculateOptimalEntry)
  [OK] REFACTOR B — ATR proximity thay distancePct hardcode


================================================================================
REFACTOR A — REMOVE WHALE-GENERATED ENTRIES
Commit: refactor(whale): remove whale-generated entries
================================================================================

Truoc:
  - bidWalls.find / askWalls.find trong calculateOptimalEntry
  - type WALL_SUPPORT tu whale wall
  - Whale co the dinh gia entry

Sau:
  - Entry priority: EMA pullback -> S/R -> patience fallback
  - finalizeEntryZone() wrap moi return
  - appendWhaleConfirmationToEntryReasoning() chi them text vao reasoning
  - entryZoneTypeFromV3() khong map whale -> WALL_SUPPORT

Whale KHONG duoc:
  - Tao entry / BUY_NOW
  - Override funding / RR filters


================================================================================
REFACTOR B — ATR PROXIMITY (thay distancePct)
Commit: refactor(whale): replace percentage distance with ATR proximity
================================================================================

Cong thuc:
  distanceATR = abs(currentPrice - wall.price) / atr

Band hop le:
  WHALE_MIN_DISTANCE_ATR <= distanceATR <= config.maxDistanceATR

| Symbol   | maxDistanceATR |
|----------|----------------|
| BTCUSDT  | 0.30           |
| BNBUSDT  | 0.35           |
| SOLUSDT  | 0.40           |
| NEARUSDT | 0.50           |

Ham moi (whaleRadarValidation.ts):
  getWhaleMaxProximityDistanceATR(symbol)
  isWhaleWithinProximityDistance(price, wallPrice, atr, symbol)

whaleConfirmation.ts:
  - nearestWhaleWallForDirection dung isWhaleWithinProximityDistance
  - isWhaleWallNearbyByDistanceAtr(symbol optional, default NEARUSDT)
  - scoreL7FlowWithWhaleConfirmation(symbol optional)


================================================================================
PIPELINE WHALE (production)
================================================================================

  Heatmap pools
      |
      v
  buildWhaleEntryWalls(symbol, price, atr, pools)
      -> filterEntryWhaleWallsByDistance()   [ATR band theo symbol]
      |
      v
  calculateOptimalEntry()                    [EMA / S/R / fallback — KHONG whale entry]
      -> finalizeEntryZone()
          -> appendWhaleConfirmationToEntryReasoning()  [chi text]
      |
      v
  scoreL7FlowWithWhaleConfirmation()         [bonus +0.5 khi L/S thuan + wall gan]
      |
      v
  scoreL13WhaleDelta()                       [order flow delta]
      |
      v
  calculateOptimalSL()                       [whale wall bao ve SL]


================================================================================
TEST COVERAGE
================================================================================

| File                           | Tests | Status |
|--------------------------------|-------|--------|
| whaleConfirmation.test.ts      | 8     | PASS   |
| whaleRadarValidation.test.ts   | 18    | PASS   |
| whaleEntryWalls.test.ts        | 1     | PASS   |
| whaleScoring.test.ts           | -     | PASS   |
| whaleMarketBehavior.test.ts    | -     | PASS   |
| tradePlanV3.test.ts            | -     | PASS   |
| tradePlanV4.test.ts            | -     | PASS   |
| FULL SUITE                     | 563   | PASS   |

Chua co test rieng:
  - appendWhaleConfirmationToEntryReasoning (reasoning suffix)
  - Per-symbol threshold BTC 0.30 vs NEAR 0.50 trong isWhaleWallNearbyByDistanceAtr


================================================================================
LEGACY CON LAI (chua dong — theo rule)
================================================================================

  indicators.ts calculateEntryZone()
    -> van dung distancePct +/-1.5% -> WALL_SUPPORT (legacy scorer path)

  constants/whaleRadar.ts
    -> WHALE_NEARBY_MAX_DISTANCE_ATR = 0.5 (deprecated, test van import)

  scorerV3/V4, tradePlanV3
    -> chua truyen symbol vao whale confirmation (default NEARUSDT 0.5)
    -> walls da pre-filter theo symbol o buildWhaleEntryWalls nen production an toan


================================================================================
VIEC TIEP THEO (REQUIRES_CONFIRMATION neu >2 files)
================================================================================

  1. Truyen symbol tu scorerV3/V4 + tradePlanV3 vao whale confirmation
  2. Test per-symbol proximity (BTC reject 0.35 ATR, NEAR accept 0.45)
  3. Deprecate WHALE_NEARBY_MAX_DISTANCE_ATR trong whaleRadar.ts
  4. Migrate / disable legacy calculateEntryZone() whale branch

"@

Set-Content -Path $reportOut -Value $report -Encoding UTF8

# --- CODE EXPORT ---
$codeHeader = @"
================================================================================
WHALE REFACTOR — FULL CODE EXPORT (Tasks 1-7 + Entry Removal + ATR Proximity)
Generated: $date
Vitest: 563/563 PASS
================================================================================

PHAN A — WHALE MODULES (full file)
  [1] constants/whaleRadar.ts
  [2] services/whaleRadarValidation.ts
  [3] services/whaleScoring.ts
  [4] services/whaleMarketBehavior.ts
  [5] services/whaleEntryWalls.ts
  [6] services/whaleConfirmation.ts

PHAN B — TRADE PLAN ENTRY (wire: calculateOptimalEntry + finalizeEntryZone)
  [7] services/tradePlanV3.ts (excerpt)

PHAN C — TESTS
  [8] services/whale*.test.ts + derivativesDataService.test.ts (whale cases)
"@

Set-Content -Path $codeOut -Value $codeHeader -Encoding UTF8

$modules = @(
  "constants\whaleRadar.ts",
  "services\whaleRadarValidation.ts",
  "services\whaleScoring.ts",
  "services\whaleMarketBehavior.ts",
  "services\whaleEntryWalls.ts",
  "services\whaleConfirmation.ts"
)
foreach ($m in $modules) { Append-File $codeOut $m $m }

$tradePlanExcerpt = @"

================================================================================
FILE: services/tradePlanV3.ts — ENTRY ENGINE (Refactor A: no whale entry)
================================================================================

// imports:
import { appendWhaleConfirmationToEntryReasoning } from './whaleConfirmation';

// finalizeEntryZone — whale chi append reasoning:
function finalizeEntryZone(zone, direction, currentPrice, ema20, atr, supports, resistances, whaleWalls) {
  return {
    ...zone,
    reasoning: appendWhaleConfirmationToEntryReasoning(
      zone.reasoning, direction,
      { direction, currentPrice, ema20, supports, resistances },
      whaleWalls, atr,
    ),
  };
}

// calculateOptimalEntry — priority:
//   1. EMA pullback
//   2. Support / Resistance
//   3. Patience fallback (MARKET_OK / LIMIT_NEAR)
// KHONG con: bidWalls.find / askWalls.find / WALL_SUPPORT

// entryZoneTypeFromV3 — khong map whale -> WALL_SUPPORT:
function entryZoneTypeFromV3(zone) {
  const r = zone.reasoning.toLowerCase();
  if (r.includes('ema')) return 'PULLBACK_EMA';
  if (r.includes('support') || r.includes('resist') || r.includes('retest')) return 'BREAKOUT_RETEST';
  if (zone.entryType === 'MARKET_OK') return 'MARKET_NEAR';
  return 'MARKET_NEAR';
}

// Xem full file trong repo: services/tradePlanV3.ts lines 135-307, 709-717

"@
Append-Text $codeOut $tradePlanExcerpt

# Append full calculateOptimalEntry section from tradePlanV3
$tpPath = Join-Path $root "services\tradePlanV3.ts"
$tpLines = Get-Content $tpPath -Encoding UTF8
$excerptStart = 134  # 0-based would be 133; PowerShell arrays are 0-indexed
$excerptEnd = 306
Append-Text $codeOut ""
Append-Text $codeOut "================================================================================"
Append-Text $codeOut "FILE: services/tradePlanV3.ts - calculateOptimalEntry (lines 135-307)"
Append-Text $codeOut "================================================================================"
Append-Text $codeOut ""
for ($i = $excerptStart; $i -le $excerptEnd; $i++) {
  Append-Text $codeOut $tpLines[$i]
}

$tests = @(
  "services\whaleRadarValidation.test.ts",
  "services\whaleScoring.test.ts",
  "services\whaleMarketBehavior.test.ts",
  "services\whaleEntryWalls.test.ts",
  "services\whaleConfirmation.test.ts",
  "services\derivativesDataService.test.ts"
)
foreach ($t in $tests) { Append-File $codeOut $t $t }

$reportSize = (Get-Item $reportOut).Length
$codeSize = (Get-Item $codeOut).Length
Write-Host "Report: $reportOut - $reportSize bytes"
Write-Host "Code:   $codeOut - $codeSize bytes"
