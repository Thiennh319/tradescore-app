/**
 * UI verify: packaged web on :5173 — V3/V4 SignalBoard → Audit → Entry Trace → Export.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const url = process.env.TS_URL || 'http://127.0.0.1:5173/';
const downloadDir = path.join(os.tmpdir(), 'tradescore-ui-verify-entry');
fs.mkdirSync(downloadDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60_000);
const push = (m) => console.log(m);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(5000);

  // Nav: Tín hiệu
  await page.getByText('Tín hiệu', { exact: true }).first().click();
  await page.waitForTimeout(1000);

  // Sub-tab: V3/V4 (not Tổng hợp / V4.1)
  await page.getByText('V3/V4', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  push('on V3/V4 board');

  const body = await page.locator('body').innerText();
  push(`hasAudit=${/Rule \+ Score Bundle|Export/.test(body)}`);
  push(`hasBTC=${/BTC/.test(body)}`);

  // Engine V4
  const engineV4 = page.getByText('V4', { exact: true });
  // Prefer the scorer chip near "Engine chấm điểm"
  const chips = page.locator('text=Engine chấm điểm').locator('..').getByText('V4', { exact: true });
  if (await chips.count()) {
    await chips.first().click();
    push('clicked Engine V4');
  } else if (await engineV4.count()) {
    // click last V4 near board header area
    await engineV4.nth(Math.min(2, (await engineV4.count()) - 1)).click().catch(() => {});
    push('clicked V4 fallback');
  }
  await page.waitForTimeout(1000);

  // Open mode dropdown
  const modeBtn = page.getByText(/Rule \+ Score Bundle/i).first();
  if (!(await modeBtn.count())) {
    throw new Error('Rule + Score Bundle control missing on V3/V4 board');
  }
  await modeBtn.click();
  await page.waitForTimeout(800);
  push('opened mode menu');

  const entryItem = page.getByText('Entry Trace', { exact: true });
  if (!(await entryItem.count())) {
    throw new Error('Entry Trace not in dropdown');
  }
  await entryItem.first().click();
  await page.waitForTimeout(600);
  push('selected Entry Trace');

  const exportBtn = page.getByText('📄 Export').first();
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await exportBtn.click();
  push('clicked Export');

  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const dest = path.join(downloadDir, suggested || '03_ENTRY_DECISION.md');
  await download.saveAs(dest);
  push(`downloaded=${suggested}`);

  const md = fs.readFileSync(dest, 'utf8');
  const tradeId = (md.match(/Trade ID:\s*(.+)/i) || [])[1]?.trim() || '?';
  push(`Trade ID: ${tradeId}`);

  const decisionChainIdx = md.indexOf('# DECISION CHAIN');
  const entrySummaryIdx = md.indexOf('# ENTRY SUMMARY');
  const aiIdx = md.indexOf('# AI REVIEW');
  const sliceChain = md.slice(decisionChainIdx, entrySummaryIdx);
  const sliceSummary = md.slice(entrySummaryIdx, aiIdx > 0 ? aiIdx : undefined);
  const chainRb = (sliceChain.match(/RuleBook State:\s*\S+/i) || [])[0];
  const summaryRb = (sliceSummary.match(/RuleBook State:\s*\S+/i) || [])[0];
  push('--- RuleBook State (UI export) ---');
  push(`DECISION CHAIN: ${chainRb}`);
  push(`ENTRY SUMMARY:  ${summaryRb}`);
  push(`MATCH=${chainRb != null && chainRb === summaryRb}`);

  // Print with section context
  const all = md.split(/\r?\n/);
  all.forEach((l, i) => {
    if (/RuleBook State:/i.test(l)) push(`L${i + 1}: ${l}`);
  });

  fs.writeFileSync(path.join(process.cwd(), 'docs', '_UI_ENTRY_EXPORT_VERIFY.md'), md, 'utf8');
  fs.writeFileSync(path.join(os.homedir(), 'Downloads', '03_ENTRY_DECISION.md'), md, 'utf8');
  push('wrote docs/_UI_ENTRY_EXPORT_VERIFY.md + Downloads/03_ENTRY_DECISION.md');

  await page.screenshot({
    path: path.join(process.cwd(), 'docs', 'TASK_UI_ENTRY_RULEBOOK_VERIFY.png'),
  });
} catch (e) {
  push(`ERROR: ${e?.message || e}`);
  const t = await page.locator('body').innerText().catch(() => '');
  push(t.slice(0, 1800));
  await page
    .screenshot({
      path: path.join(process.cwd(), 'docs', 'TASK_UI_ENTRY_RULEBOOK_VERIFY.png'),
      fullPage: true,
    })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
