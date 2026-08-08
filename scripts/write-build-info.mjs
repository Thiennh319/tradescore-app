/**
 * BUILD_INFO dong bo EXE + APK — cung parity constants, cung test count.
 * Usage: node scripts/write-build-info.mjs exe|apk <output-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
// Product/UI build version SSOT: app.json expo.version (keep package.json in sync).
// Independent from Engine Version labels inside trade export snapshots.
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (pkgVersion !== appVersion) {
  console.error(`Version mismatch: package.json=${pkgVersion} app.json=${appVersion}`);
  process.exit(1);
}
const platform = process.argv[2];
const outPath = process.argv[3];

if (!platform || !outPath || !['exe', 'apk'].includes(platform)) {
  console.error('Usage: node scripts/write-build-info.mjs exe|apk <output-path>');
  process.exit(1);
}

const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
const BUILD_DATE = '2026-08-02';
const VERSION_LABEL = `v${appVersion}`;
const TEST_COUNT = 2374;

const FEATURES = [
  'NEAR SHORT V4: S1 L3≥1.5 hard (NEAR-only) + S3 L3≥2 nhãn tín hiệu mạnh',
  'Ambiguity threshold 2.5 (V3+V4, 4 coin) + Signal Board U1 (1 nút active / mờ khi ambiguous)',
  'NEARUSDT rulebook: Source Module Task 6b + Reason Task 6 + Evidence/split Task 7/7b',
  'NEARUSDT: RC3 Breakout Confirm B (Donchian N20/X5, ATR SL×1.0, TP 1.5R); BTC/SOL/BNB giữ Trend Reversal',
  'UI breakout: ghi chú TP1 only · 1.5R; rulebook/export branch breakout cho NEAR',
  'UL Analytics Engine + Performance HT dashboard (Phase 15)',
  'Trading Coach + Portfolio Advisor (tiếng Việt)',
  'Entry Quality Engine + Explainability',
  'Trace Export: RuleBook / Score / Entry / Position / TradePlan (Phase 16)',
  'AI Review Export: 5 báo cáo tự chứa (Phase 17)',
  'Menu Xuất dữ liệu: Trace Export + AI Review Export, copy + download Markdown',
  'Journal Intelligence + Statistics / Performance / Dashboard Intelligence',
  'Fix VWAP entry direction validation (limit khớp ngay → NEUTRAL)',
  'Fix TradePlan CONFLICT DETECTION: positionState from openTrades (OPEN|NONE), rule WAIT/AVOID+OPEN',
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
