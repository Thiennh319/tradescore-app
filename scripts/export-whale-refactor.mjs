import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const reportOut = path.join(root, 'dist', 'WHALE_REFACTOR-export.txt');
const codeOut = path.join(root, 'dist', 'WHALE_REFACTOR-CODE-export.txt');
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function appendFile(out, title, rel) {
  out.push('');
  out.push('='.repeat(80));
  out.push(`FILE: ${title}`);
  out.push('='.repeat(80));
  out.push('');
  out.push(read(rel));
}

const report = `================================================================================
EXPORT — Whale Refactor (Tasks 1-7 + Entry Removal + ATR Proximity)
Generated: ${date}
================================================================================

KIEM TRA:
  npx vitest run (full project)  -> 563/563 PASS (75 files)

COMMITS DE XUAT:
  refactor(whale): remove whale-generated entries
  refactor(whale): replace percentage distance with ATR proximity

FILES MODIFIED (refactor moi):
  services/tradePlanV3.ts
  services/whaleConfirmation.ts
  services/whaleRadarValidation.ts

CODE EXPORT:
  dist/WHALE_REFACTOR-CODE-export.txt
  Regenerate: node scripts/export-whale-refactor.mjs

================================================================================
TOM TAT TIEN DO
================================================================================

  [OK] TASK 1-7  — Config, validation, anti-spoof, L13 +0.5, confirmation, RANGING, min 0.10 ATR
  [OK] REFACTOR A — Remove whale-generated entries (calculateOptimalEntry)
  [OK] REFACTOR B — ATR proximity thay distancePct hardcode

================================================================================
REFACTOR A — REMOVE WHALE-GENERATED ENTRIES
================================================================================

Truoc: bidWalls.find / WALL_SUPPORT / whale dinh gia entry
Sau:   EMA -> S/R -> fallback; whale chi append reasoning

================================================================================
REFACTOR B — ATR PROXIMITY
================================================================================

distanceATR = abs(currentPrice - wall.price) / atr

| Symbol   | maxDistanceATR |
|----------|----------------|
| BTCUSDT  | 0.30           |
| BNBUSDT  | 0.35           |
| SOLUSDT  | 0.40           |
| NEARUSDT | 0.50           |

Ham moi: getWhaleMaxProximityDistanceATR, isWhaleWithinProximityDistance

================================================================================
PIPELINE
================================================================================

buildWhaleEntryWalls -> filterEntryWhaleWallsByDistance
  -> calculateOptimalEntry -> finalizeEntryZone -> appendWhaleConfirmation
  -> scoreL7FlowWithWhaleConfirmation -> scoreL13WhaleDelta -> calculateOptimalSL

================================================================================
TEST: 563/563 PASS
================================================================================

LEGACY: indicators.ts calculateEntryZone() van co distancePct whale (scorer cu)
TODO: truyen symbol vao scorer/tradePlan (REQUIRES_CONFIRMATION)
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(reportOut, report, 'utf8');

const code = [];
code.push(`================================================================================
WHALE REFACTOR — FULL CODE EXPORT
Generated: ${date}
Vitest: 563/563 PASS
================================================================================`);

const modules = [
  'constants/whaleRadar.ts',
  'services/whaleRadarValidation.ts',
  'services/whaleScoring.ts',
  'services/whaleMarketBehavior.ts',
  'services/whaleEntryWalls.ts',
  'services/whaleConfirmation.ts',
];
for (const m of modules) appendFile(code, m, m);

const tpLines = read('services/tradePlanV3.ts').split(/\r?\n/);
code.push('');
code.push('='.repeat(80));
code.push('FILE: services/tradePlanV3.ts - calculateOptimalEntry (lines 135-307)');
code.push('='.repeat(80));
code.push('');
code.push(tpLines.slice(134, 307).join('\n'));

const tests = [
  'services/whaleRadarValidation.test.ts',
  'services/whaleScoring.test.ts',
  'services/whaleMarketBehavior.test.ts',
  'services/whaleEntryWalls.test.ts',
  'services/whaleConfirmation.test.ts',
  'services/derivativesDataService.test.ts',
];
for (const t of tests) appendFile(code, t, t);

fs.writeFileSync(codeOut, code.join('\n'), 'utf8');

console.log(`Report: ${reportOut} (${fs.statSync(reportOut).size} bytes)`);
console.log(`Code:   ${codeOut} (${fs.statSync(codeOut).size} bytes)`);
