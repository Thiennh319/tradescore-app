/**
 * BUILD_INFO dong bo EXE + APK — cung parity constants, cung test count.
 * Usage: node scripts/write-build-info.mjs exe|apk <output-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const platform = process.argv[2];
const outPath = process.argv[3];

if (!platform || !outPath || !['exe', 'apk'].includes(platform)) {
  console.error('Usage: node scripts/write-build-info.mjs exe|apk <output-path>');
  process.exit(1);
}

const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
const BUILD_DATE = '2026-07-05';
const VERSION_LABEL = `v${pkgVersion}`;
const TEST_COUNT = 997;

const FEATURES = [
  'Momentum 1H Engine (Volume + CVD)',
  'Exhaustion Detection (Capitulation + Volume Fade + Funding Extreme)',
  'Rule V4.1: 3 điều kiện bắt buộc',
  'RESCUE strength cho exhaustion',
  'Counter-trend 3 điều kiện đầy đủ',
  'Early Warning mirror BEAR',
  'Funding Rate trong V4.1',
  'Fix klines1H reversal modal',
  'Fix Unified v41 data từ store',
];

const featuresBlock = FEATURES.map((f) => `  - ${f}`).join('\n');

const parity = `Parity APK <-> EXE <-> guideline (cung codebase):
  Runtime: Scorer V3 + V4 + tab V4.1 (Market Intelligence 4H, song song V3/V4)
  V4.1: Entry Quality >= 70 de vao lenh | Position Advisor V4.1 | Journal tag v41Snapshot
  SCORE_THRESHOLDS (15d): >=11.5 SETUP NGON | >=10 VAO TU TIN | >=9 CO THE VAO | >=8 CHO THEM | <8 KHONG VAO
  CAPITAL_RATIOS: size 17.65% | maxLoss 25% size | leverage 5x | milestone +30%
  TP_MIN_PROBABILITY: 0.45 | TP_PROBABILITY_FILTER: false (tham khao) | MIN_RR_TO_ENTER: 2.0
  Entry Buffer: max(min 0.30%, min ATRx0.25, cap 0.50%) | Plan Expiry: 4h/8h/12h theo score
  Plan Health: 5 penalty (Squeeze/CVD/Funding/MACD/RSI) | auto-cancel >=3 tin hieu hoac CRITICAL
  ADX Gate: CHOPPY block | RANGING TPx0.85 SLx1.1 | TRENDING_STRONG TPx1.2 SLx0.9
  VWAP: session UTC 15M/1H | L5 bonus +0.5 near VWAP | entryOptions goi y (khong doi recommendedEntry)
  Structure SL: swing 4H + buffer 0.3% | fallback ATR | recalc R:R
  L11 Squeeze Risk: score 0-10 (khong cong 15d) | squeezeWarning | SQUEEZE_RISK_ALERT pri 70 (lenh mo)
  Advisor maxLossUSDT: OPPOSITE 30% | FUNDING 50% | SQUEEZE 40% | fallback 0 khi thieu data
  Partial Close: PARTIAL_TP1 50% | PARTIAL_TP2 30% | PARTIAL_CLOSE_30 30%
  Google Drive Sync: journal + positions + capital | SyncStatusBadge | Web pull startup
  Pipeline V3/V4: score -> VWAP bonus -> plan -> ADX -> VWAP entry -> Structure SL -> enrich -> journal
  Tests: ${TEST_COUNT} vitest — APK va EXE build tu cung source tree`;

const meta = `version: ${VERSION_LABEL}
buildDate: ${BUILD_DATE}
features:
${featuresBlock}`;

const bodies = {
  exe: `TradeScore ${VERSION_LABEL}
Platform: Desktop Web (EXE + WebView2)
Build: ${ts}
${meta}

Engine: V3/V4 + V4.1 MI | ADX Gate | VWAP | Structure SL | L11 Squeeze | Drive Sync | Partial Close
Note: Cung logic scoring/advisor/capital voi APK Android ${VERSION_LABEL} | ${TEST_COUNT} tests

${parity}`,
  apk: `TradeScore ${VERSION_LABEL}
Platform: Android APK
Build: ${ts}
${meta}

Engine: V3/V4 + V4.1 MI | ADX Gate | VWAP | Structure SL | L11 Squeeze | Drive Sync | Partial Close
Note: Cung logic scoring/advisor/capital voi Desktop EXE ${VERSION_LABEL} | ${TEST_COUNT} tests

${parity}`,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), bodies[platform], 'utf8');
console.log('BUILD_INFO:', path.resolve(outPath));
