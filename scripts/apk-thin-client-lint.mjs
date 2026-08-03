/**
 * Task 14.5 — APK Thin Client structural lint (frozen architecture).
 * Full-repo `tsc` remains blocked by pre-existing DO NOT TOUCH debt (~200 errors).
 * This gate verifies APK UI split invariants only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const platform = fs.readFileSync(path.join(root, 'constants/platformUi.ts'), 'utf8');

if (!platform.includes('IS_DESKTOP_ANALYSIS_UI')) fail('platformUi missing IS_DESKTOP_ANALYSIS_UI');
if (!platform.includes('IS_APK_THIN_CLIENT')) fail('platformUi missing IS_APK_THIN_CLIENT');
if (!platform.includes("Platform.OS === 'web'")) fail('desktop UI must be web-only');

if (!app.includes('APK_TABS')) fail('App.tsx missing APK_TABS');
if (!app.includes('DESKTOP_TABS')) fail('App.tsx missing DESKTOP_TABS');

const apkBlock = app.match(/const APK_TABS[\s\S]*?=\s*\[[\s\S]*?\];/);
if (!apkBlock) fail('Could not parse APK_TABS');
for (const forbidden of ['journal', 'insights', 'performance']) {
  if (new RegExp(`id:\\s*['"]${forbidden}['"]`).test(apkBlock[0])) {
    fail(`APK_TABS must not include tab '${forbidden}'`);
  }
}
if (!/id:\s*['"]signals['"]/.test(apkBlock[0])) fail('APK_TABS must include signals');
if (!/id:\s*['"]settings['"]/.test(apkBlock[0])) fail('APK_TABS must include settings');

const requiredGates = [
  "IS_DESKTOP_ANALYSIS_UI && activeTab === 'journal'",
  "IS_DESKTOP_ANALYSIS_UI && activeTab === 'insights'",
  "IS_DESKTOP_ANALYSIS_UI && activeTab === 'performance'",
];

for (const gate of requiredGates) {
  if (!app.includes(gate)) {
    fail(`Missing desktop gate: ${gate}`);
  }
}

/** Task 14.6.1 — Signal tab must not host Dashboard Intelligence. */
if (/DashboardIntelligencePanel/.test(app)) {
  fail('DashboardIntelligencePanel must not be mounted from App Signal tab (Task 14.6.1)');
}

if (!app.includes("activeTab !== 'signals' && activeTab !== 'settings'")) {
  fail('APK tab reset effect missing (must force Signal/Settings only)');
}

if (!app.includes('IS_DESKTOP_ANALYSIS_UI ? DESKTOP_TABS : APK_TABS')) {
  fail('Tab bar must switch DESKTOP_TABS vs APK_TABS by platform');
}

/** Hotfix: Quick Analysis (Phân tích nhanh) is Trading Layer — must not be desktop-gated. */
if (!app.includes('vi.psychology.open')) {
  fail('Quick Analysis button label (vi.psychology.open) missing');
}
if (/IS_DESKTOP_ANALYSIS_UI[\s\S]{0,180}vi\.psychology\.open/.test(app)) {
  fail('Quick Analysis must not be gated behind IS_DESKTOP_ANALYSIS_UI (Trading Layer)');
}
if (!app.includes('handleQuickAnalyze') || !app.includes('<PsychologyModal')) {
  fail('Quick Analysis flow (PsychologyModal + handleQuickAnalyze) must remain wired');
}

console.log('PASS: APK thin-client lint invariants');
