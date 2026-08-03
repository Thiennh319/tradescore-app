/**
 * Render UI mockup HTML → PNG states for Export Coin dropdown.
 * Usage: node scripts/render-export-coin-dropdown-mockups.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'ui-mockups', 'export-coin-dropdown');
const htmlPath = path.join(outDir, 'mockup.html');
const require = createRequire(import.meta.url);

const SHOTS = [
  { id: 'state-closed', file: '01-closed.png' },
  { id: 'state-coin-open', file: '02-coin-open.png' },
  { id: 'state-trace-open', file: '03-trace-open.png' },
];

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright missing');
  process.exit(1);
}

if (!fs.existsSync(htmlPath)) {
  console.error('Missing', htmlPath);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 980, height: 1100 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded' });

for (const shot of SHOTS) {
  const el = page.locator(`#${shot.id}`);
  await el.scrollIntoViewIfNeeded();
  const out = path.join(outDir, shot.file);
  await el.screenshot({ path: out });
  console.log('PNG:', out);
}

// Full page overview
const full = path.join(outDir, '00-overview-all-states.png');
await page.screenshot({ path: full, fullPage: true });
console.log('PNG:', full);

await browser.close();
