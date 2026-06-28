/**
 * BUILD_INFO dong bo EXE + APK — cung parity constants, cung test count.
 * Usage: node scripts/write-build-info.mjs exe|apk <output-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const platform = process.argv[2];
const outPath = process.argv[3];

if (!platform || !outPath || !['exe', 'apk'].includes(platform)) {
  console.error('Usage: node scripts/write-build-info.mjs exe|apk <output-path>');
  process.exit(1);
}

const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
const TEST_COUNT = 592;

const parity = `Parity APK <-> EXE <-> guideline (cung codebase):
  Runtime: Scorer V3 + V4 only — V4.1 (services/v41/) KHONG trong app build
  SCORE_THRESHOLDS (15d): >=11.5 SETUP NGON | >=10 VAO TU TIN | >=9 CO THE VAO | >=8 CHO THEM | <8 KHONG VAO
  CAPITAL_RATIOS: size 17.65% | maxLoss 25% size | leverage 5x | milestone +30%
  TP_MIN_PROBABILITY: 0.45 | TP_PROBABILITY_FILTER: false (tham khao) | MIN_RR_TO_ENTER: 2.0
  Entry Buffer: max(min 0.30%, min ATRx0.25, cap 0.50%) | Plan Expiry: 4h/8h/12h theo score
  Plan Health: 5 penalty (Squeeze/CVD/Funding/MACD/RSI) | auto-cancel >=3 tin hieu hoac CRITICAL
  MACD Hard Block UI: an L3 MACD khi locked plan gan entry (Plan Health chua CRITICAL)
  L11 Squeeze Risk: score 0-10 (khong cong 15d) | squeezeWarning | SQUEEZE_RISK_ALERT pri 70 (lenh mo)
  Advisor maxLossUSDT: OPPOSITE 30% | FUNDING 50% | SQUEEZE 40% | fallback 0 khi thieu data
  Advisor exit tracking: positionAdvisorActionAtExit + followedAdvisorRecommendation + manualExitReason (CloseTradeModal)
  Auto-close SL: priceLevelMonitor — tu dong dong + ghi journal khi cham SL (60s tick)
  Whale: filterValidWhaleWalls wired (radar + scoring) | confirmation-only entry | ATR proximity per symbol
  Google Drive Sync: journal + positions + capital | SyncStatusBadge | Web pull startup
  Pipeline: signalBoardScan -> V3+V4 -> finalEntryStatus -> journal funding+squeeze+advisor exit
  Tests: ${TEST_COUNT} vitest — APK va EXE build tu cung source tree`;

const bodies = {
  exe: `TradeScore v${version}
Platform: Desktop Web (EXE + WebView2)
Build: ${ts}
Engine: Scorer V3/V4 | L11 Squeeze Risk | Google Drive Sync | FinalEntryStatus | tradePlanValid | Grace | Trade Plan V4
Note: Cung logic scoring/advisor/capital voi APK Android v${version} | ${TEST_COUNT} tests

${parity}`,
  apk: `TradeScore v${version}
Platform: Android APK
Build: ${ts}
Engine: Scorer V3/V4 | L11 Squeeze Risk | Google Drive Sync | FinalEntryStatus | tradePlanValid | Grace | Trade Plan V4
Note: Cung logic scoring/advisor/capital voi Desktop EXE v${version} | ${TEST_COUNT} tests

${parity}`,
};

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(path.resolve(outPath), bodies[platform], 'utf8');
console.log('BUILD_INFO:', path.resolve(outPath));
