/**
 * Task 2.4 — UI Position Trace export verify (EXE :5173).
 * Seeds real OPEN trade extracted from EXE Local Storage, drives SignalBoard export.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const url = process.env.TS_URL || 'http://127.0.0.1:5173/';
const root = process.cwd();
const openTrade = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/_ui_open_trade_btc_long.json'), 'utf8'),
);
const outDir = path.join(os.tmpdir(), 'tradescore-ui-position-verify');
fs.mkdirSync(outDir, { recursive: true });

function extractSection(md, heading) {
  const needle = `# ${heading}`;
  const start = md.indexOf(needle);
  if (start < 0) return `(missing ${heading})`;
  const after = start + needle.length;
  const next = md.indexOf('\n# ', after);
  return next < 0 ? md.slice(start) : md.slice(start, next);
}

async function exportPositionTrace(page, label) {
  await page.getByText('Tín hiệu', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('V3/V4', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1000);

  await page.waitForFunction(
    () => document.body.innerText.includes('Rule + Score Bundle') || document.body.innerText.includes('Entry Trace'),
    null,
    { timeout: 120000 },
  ).catch(() => {});

  const rescan = page.getByText('Quét lại', { exact: true }).first();
  if (await rescan.count()) {
    await rescan.click();
    console.log(`[${label}] Quét lại`);
  }
  await page.waitForTimeout(8000);

  // Engine V4 chip
  try {
    const v4 = page.locator('text=/Engine chấm điểm/').locator('xpath=..').getByText('V4', { exact: true });
    if (await v4.count()) await v4.first().click();
  } catch { /* ignore */ }
  await page.waitForTimeout(500);

  const modeBtn = page.getByText(/Rule \+ Score Bundle|Position Trace|Entry Trace/i).first();
  await modeBtn.click();
  await page.waitForTimeout(600);
  await page.getByText('Position Trace', { exact: true }).first().click();
  await page.waitForTimeout(400);

  const dlP = page.waitForEvent('download', { timeout: 90000 });
  await page.getByText('📄 Export').first().click();
  const dl = await dlP;
  const dest = path.join(outDir, `${label}-${dl.suggestedFilename() || '04_POSITION_ADVISER.md'}`);
  await dl.saveAs(dest);
  const md = fs.readFileSync(dest, 'utf8');
  console.log(`[${label}] downloaded ${dest} bytes=${md.length}`);
  return { dest, md };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(90000);

try {
  // Seed journal BEFORE first paint via init script
  await page.addInitScript((trade) => {
    try {
      localStorage.setItem('gd1_trade_journal_v2', JSON.stringify([trade]));
    } catch { /* ignore */ }
  }, openTrade);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);

  // Ensure seed survived hydrate (re-apply + soft reload if wiped)
  const seeded = await page.evaluate((trade) => {
    const raw = localStorage.getItem('gd1_trade_journal_v2');
    let ok = false;
    try {
      const arr = raw ? JSON.parse(raw) : [];
      ok = Array.isArray(arr) && arr.some((t) => t && t.id === trade.id && t.outcome?.status === 'OPEN');
    } catch { /* ignore */ }
    if (!ok) {
      localStorage.setItem('gd1_trade_journal_v2', JSON.stringify([trade]));
      return 'reseeded';
    }
    return 'ok';
  }, openTrade);
  console.log('journal seed:', seeded);
  if (seeded === 'reseeded') {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }

  const withOpen = await exportPositionTrace(page, 'with-open');
  fs.writeFileSync(path.join(root, 'docs/_UI_04_POSITION_ADVISER_WITH_OPEN.md'), withOpen.md, 'utf8');
  fs.writeFileSync(path.join(os.homedir(), 'Downloads', '04_POSITION_ADVISER_WITH_OPEN.md'), withOpen.md, 'utf8');

  console.log('===== WITH OPEN: ADVISER DECISION =====');
  console.log(extractSection(withOpen.md, 'ADVISER DECISION'));
  console.log('===== WITH OPEN: ADVISER CHECKLIST (head) =====');
  console.log(extractSection(withOpen.md, 'ADVISER CHECKLIST').slice(0, 400));
  console.log('===== WITH OPEN: POSITION ACTION =====');
  console.log(extractSection(withOpen.md, 'POSITION ACTION'));
  console.log('===== WITH OPEN: STOP LOSS PLAN =====');
  console.log(extractSection(withOpen.md, 'STOP LOSS PLAN'));

  // Case no OPEN: clear journal and re-export
  await page.evaluate(() => {
    localStorage.setItem('gd1_trade_journal_v2', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const noOpen = await exportPositionTrace(page, 'no-open');
  fs.writeFileSync(path.join(root, 'docs/_UI_04_POSITION_ADVISER_NO_OPEN.md'), noOpen.md, 'utf8');
  fs.writeFileSync(path.join(os.homedir(), 'Downloads', '04_POSITION_ADVISER_NO_OPEN.md'), noOpen.md, 'utf8');

  console.log('===== NO OPEN: ADVISER DECISION =====');
  console.log(extractSection(noOpen.md, 'ADVISER DECISION'));
  console.log('===== NO OPEN: meta Trade ID / Entry reuse check =====');
  const decision = extractSection(noOpen.md, 'ADVISER DECISION');
  console.log('contains VÀO TỰ TIN?', decision.includes('VÀO TỰ TIN'));
  console.log('contains ~70-75%?', decision.includes('~70-75%'));

  await page.screenshot({ path: path.join(root, 'docs/TASK_2_4_POSITION_TRACE_UI.png') });
} catch (e) {
  console.error('ERROR', e?.message || e);
  await page.screenshot({ path: path.join(root, 'docs/TASK_2_4_POSITION_TRACE_UI_ERROR.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
