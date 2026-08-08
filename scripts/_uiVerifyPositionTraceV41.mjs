/**
 * Task 2.4b — Seed temporary V4.1 OPEN trade, UI-export Position Trace, then clean up.
 * Does NOT modify production code. Playwright hits packaged web on :5173 (isolated
 * browser profile — does not touch EXE WebView2 user data).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const url = process.env.TS_URL || 'http://127.0.0.1:5173/';
const root = process.cwd();
const seedPath = path.join(root, 'docs/_ui_open_trade_sol_v41_task24b.json');
const seedTemplate = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const TEST_ID = seedTemplate.id;
const outDir = path.join(os.tmpdir(), 'tradescore-ui-position-v41-verify');
fs.mkdirSync(outDir, { recursive: true });

const MOD_TRADE_STORE = 214;
const MOD_V41_STORE = 505;

const minimalV41Snapshot = {
  trendStrength: 62,
  trendDirection: 'BULL',
  trendExhaustion: 28,
  volumeDivergencePts: 0,
  reversalProbability: 22,
  rsiDivergenceScore: 0,
  cvdDivergenceScore: 0,
  marketConfidence: 74,
  btcAlignmentFactor: 1,
  btcDirection: 'BULL',
  marketState: 'HealthyUptrend',
  scanTimestamp: Date.now(),
};

function extractSection(md, heading) {
  const needle = `# ${heading}`;
  const start = md.indexOf(needle);
  if (start < 0) return `(missing ${heading})`;
  const after = start + needle.length;
  const next = md.indexOf('\n# ', after);
  return next < 0 ? md.slice(start) : md.slice(start, next);
}

function metaField(md, label) {
  const re = new RegExp(`^${label}:\\s*(.+)$`, 'm');
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

function buildTrade(overrides = {}) {
  return {
    ...seedTemplate,
    ...overrides,
    market: { ...seedTemplate.market, ...(overrides.market || {}) },
    scoring: { ...seedTemplate.scoring, ...(overrides.scoring || {}) },
    plan: { ...seedTemplate.plan, ...(overrides.plan || {}) },
    outcome: { status: 'OPEN' },
    tags: ['v41', 'task24b-test-seed'],
    archived: false,
  };
}

function planPrices(symbol, side) {
  const isLong = side === 'LONG';
  const table = {
    BTCUSDT: { entry: 65000, sl: isLong ? 64000 : 66000, tp1: isLong ? 68000 : 62000 },
    NEARUSDT: { entry: 5.5, sl: isLong ? 5.2 : 5.8, tp1: isLong ? 6 : 5 },
    SOLUSDT: { entry: 145.5, sl: isLong ? 140 : 150, tp1: isLong ? 155 : 135 },
    BNBUSDT: { entry: 600, sl: isLong ? 580 : 620, tp1: isLong ? 640 : 560 },
  };
  return table[symbol] ?? table.SOLUSDT;
}

async function wipeVerifyStorage(page) {
  return page.evaluate(async () => {
    window.name = '';
    const lsKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('gd1_') ||
          k.startsWith('@tradescore') ||
          k.includes('tradescore'))
      ) {
        lsKeys.push(k);
      }
    }
    lsKeys.forEach((k) => localStorage.removeItem(k));
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('tradescore-persist-v1');
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => resolve(undefined);
      req.onblocked = () => resolve(undefined);
    });
    return { clearedLs: lsKeys.length };
  });
}

async function forceJournal(page, trade) {
  return page.evaluate(
    ({ modId, trade, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify([trade]));
      localStorage.setItem('gd1_open_trade', JSON.stringify(trade));
      const mod = typeof __r === 'function' ? __r(modId) : null;
      if (mod?.useTradeStore) {
        mod.useTradeStore.setState({
          aiTradeJournal: [trade],
          currentOpenDataTrade: trade,
        });
      }
      const journal = mod?.useTradeStore?.getState?.().aiTradeJournal ?? [];
      return {
        storeCount: journal.length,
        hasTest: journal.some((t) => t && t.id === trade.id),
        symbol: journal[0]?.symbol,
        scorer: journal[0]?.scoring?.scorerVersion,
        tags: journal[0]?.tags,
      };
    },
    {
      modId: MOD_TRADE_STORE,
      trade,
      storageKey: 'gd1_trade_journal_v2',
    },
  );
}

async function injectV41Snapshot(page, symbol) {
  return page.evaluate(
    ({ modId, symbol, snapshot }) => {
      const mod = typeof __r === 'function' ? __r(modId) : null;
      if (!mod?.useV41Store) return { ok: false, reason: 'no_useV41Store' };
      mod.useV41Store
        .getState()
        .updateSymbolState(symbol, 'POSITION_MODE', snapshot);
      const got = mod.useV41Store.getState().getSymbolState(symbol).lastSnapshot;
      return {
        ok: got != null,
        marketState: got?.marketState ?? null,
        trendStrength: got?.trendStrength ?? null,
      };
    },
    { modId: MOD_V41_STORE, symbol, snapshot: minimalV41Snapshot },
  );
}

async function waitHydrated(page) {
  await page.waitForFunction(
    () => {
      try {
        return __r(214)?.useTradeStore?.getState?.().hydrated === true;
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120000 },
  );
}

async function ensureOnSignalBoard(page) {
  await page.getByText('Tín hiệu', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByText('V3/V4', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
}

async function rescanV3V4(page) {
  await ensureOnSignalBoard(page);
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Rule + Score Bundle') ||
      document.body.innerText.includes('Entry Trace') ||
      document.body.innerText.includes('Quét lại'),
    null,
    { timeout: 120000 },
  ).catch(() => {});
  const rescan = page.getByText('Quét lại', { exact: true }).first();
  if (await rescan.count()) {
    await rescan.click();
    console.log('Quét lại V3/V4');
  }
  await page.waitForTimeout(10000);
  try {
    const v4 = page
      .locator('text=/Engine chấm điểm/')
      .locator('xpath=..')
      .getByText('V4', { exact: true });
    if (await v4.count()) await v4.first().click();
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(500);
}

async function exportPositionTrace(page, label) {
  await ensureOnSignalBoard(page);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  const modeBtn = page
    .getByText(/Rule \+ Score Bundle|Position Trace|Entry Trace/i)
    .first();
  await modeBtn.click({ force: true });
  await page.waitForTimeout(500);
  await page
    .getByText('Position Trace', { exact: true })
    .first()
    .click({ force: true });
  await page.waitForTimeout(400);

  const dlP = page.waitForEvent('download', { timeout: 90000 });
  await page.getByText('📄 Export').first().click({ force: true });
  const dl = await dlP;
  const dest = path.join(
    outDir,
    `${label}-${dl.suggestedFilename() || '04_POSITION_ADVISER.md'}`,
  );
  await dl.saveAs(dest);
  const md = fs.readFileSync(dest, 'utf8');
  console.log(`[${label}] downloaded ${dest} bytes=${md.length}`);
  return { dest, md };
}

async function cleanupAll(page) {
  return page.evaluate(
    async ({ modTrade, modV41, testId, storageKey }) => {
      window.name = '';
      const lsKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('gd1_') || k.startsWith('@tradescore'))) {
          lsKeys.push(k);
        }
      }
      lsKeys.forEach((k) => localStorage.removeItem(k));

      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('tradescore-persist-v1');
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => resolve(undefined);
        req.onblocked = () => resolve(undefined);
      });

      const tradeMod = typeof __r === 'function' ? __r(modTrade) : null;
      const v41Mod = typeof __r === 'function' ? __r(modV41) : null;
      if (tradeMod?.useTradeStore) {
        tradeMod.useTradeStore.setState({
          aiTradeJournal: [],
          currentOpenDataTrade: null,
        });
      }
      if (v41Mod?.useV41Store) {
        v41Mod.useV41Store.setState({ symbolStates: {}, isScanning: false });
      }

      const after = tradeMod?.useTradeStore?.getState?.().aiTradeJournal ?? [];
      const ls = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return {
        storeCount: after.length,
        lsCount: Array.isArray(ls) ? ls.length : -1,
        stillHasTest: (Array.isArray(after) ? after : []).some(
          (t) => t && (t.id === testId || (t.tags || []).includes('task24b-test-seed')),
        ),
        v41Keys: Object.keys(v41Mod?.useV41Store?.getState?.().symbolStates ?? {}),
      };
    },
    {
      modTrade: MOD_TRADE_STORE,
      modV41: MOD_V41_STORE,
      testId: TEST_ID,
      storageKey: 'gd1_trade_journal_v2',
    },
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(90000);

try {
  const initial = buildTrade();
  await page.addInitScript((trade) => {
    try {
      window.name = '';
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gd1_')) localStorage.removeItem(k);
      }
      localStorage.setItem('gd1_trade_journal_v2', JSON.stringify([trade]));
    } catch {
      /* ignore */
    }
  }, initial);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitHydrated(page);
  console.log('wipe:', await wipeVerifyStorage(page));
  console.log('force initial:', await forceJournal(page, initial));

  await rescanV3V4(page);

  const probe = await exportPositionTrace(page, 'probe');
  const coin = metaField(probe.md, 'Coin');
  const side = metaField(probe.md, 'Side') === 'SHORT' ? 'SHORT' : 'LONG';
  console.log(
    'probe Coin/Side/Adviser/TradeID:',
    coin,
    side,
    metaField(probe.md, 'Adviser Version'),
    metaField(probe.md, 'Trade ID'),
  );

  const targetSymbol = coin || 'NEARUSDT';
  const prices = planPrices(targetSymbol, side);
  const aligned = buildTrade({
    symbol: targetSymbol,
    scoring: {
      ...seedTemplate.scoring,
      direction: side,
      scorerVersion: 'v41',
    },
    market: {
      ...seedTemplate.market,
      entryPrice: prices.entry,
    },
    plan: {
      ...seedTemplate.plan,
      slActual: prices.sl,
      slProposed: prices.sl,
      tp1Actual: prices.tp1,
      tp1Proposed: prices.tp1,
    },
  });

  console.log('aligned:', aligned.symbol, aligned.scoring.direction, aligned.id);
  console.log('force aligned:', await forceJournal(page, aligned));
  console.log('inject snapshot:', await injectV41Snapshot(page, aligned.symbol));
  await page.waitForTimeout(500);

  const withV41 = await exportPositionTrace(page, 'v41-open');
  fs.writeFileSync(
    path.join(root, 'docs/_UI_04_POSITION_ADVISER_V41_SEED.md'),
    withV41.md,
    'utf8',
  );
  fs.writeFileSync(
    path.join(os.homedir(), 'Downloads', '04_POSITION_ADVISER_V41_SEED.md'),
    withV41.md,
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'docs/_ui_open_trade_v41_task24b_aligned.json'),
    JSON.stringify(aligned, null, 2),
    'utf8',
  );

  console.log('===== V4.1 META =====');
  console.log('Coin:', metaField(withV41.md, 'Coin'));
  console.log('Side:', metaField(withV41.md, 'Side'));
  console.log('Trade ID:', metaField(withV41.md, 'Trade ID'));
  console.log('Strategy:', metaField(withV41.md, 'Strategy'));
  console.log('Adviser Version:', metaField(withV41.md, 'Adviser Version'));
  console.log('===== ADVISER DECISION =====');
  console.log(extractSection(withV41.md, 'ADVISER DECISION'));
  console.log('===== POSITION ACTION =====');
  console.log(extractSection(withV41.md, 'POSITION ACTION'));
  console.log('===== STOP LOSS PLAN =====');
  console.log(extractSection(withV41.md, 'STOP LOSS PLAN'));
  console.log('===== POSITION SNAPSHOT (BE/Trailing) =====');
  console.log(
    extractSection(withV41.md, 'POSITION SNAPSHOT')
      .split('\n')
      .filter((l) => /Trailing|Break Even|Current Adviser/i.test(l))
      .join('\n'),
  );

  const cleanup = await cleanupAll(page);
  console.log('===== CLEANUP =====');
  console.log(cleanup);

  const adviserVersion = metaField(withV41.md, 'Adviser Version');
  const strategy = metaField(withV41.md, 'Strategy');
  const tradeId = metaField(withV41.md, 'Trade ID');
  const okV41 =
    adviserVersion === 'v41' &&
    strategy === 'v41' &&
    tradeId === TEST_ID;
  const okClean =
    cleanup.stillHasTest === false &&
    cleanup.storeCount === 0 &&
    cleanup.v41Keys.length === 0;

  if (!okV41 || !okClean) {
    console.error('VERIFY FAILED', { okV41, okClean, adviserVersion, strategy, tradeId });
    process.exitCode = 1;
  } else {
    console.log('VERIFY OK — V4.1 adviser + cleanup');
  }

  await page.screenshot({
    path: path.join(root, 'docs/TASK_2_4b_POSITION_TRACE_V41_UI.png'),
  });
} catch (e) {
  console.error('ERROR', e?.message || e);
  await page
    .screenshot({
      path: path.join(root, 'docs/TASK_2_4b_POSITION_TRACE_V41_UI_ERROR.png'),
      fullPage: true,
    })
    .catch(() => {});
  await cleanupAll(page).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
