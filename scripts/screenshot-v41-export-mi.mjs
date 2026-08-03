import { chromium } from 'playwright';
import path from 'node:path';

const out = path.resolve('docs/outputs/v41-export-mi-button-live.png');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(3000);

const v41 = page.getByText('V4.1', { exact: true }).first();
await v41.click({ timeout: 15000 });
await page.waitForTimeout(5000);

const panel = page.getByText('Signal Panel').first();
if ((await panel.count()) > 0) {
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
}

await page.screenshot({ path: out, fullPage: false });
console.log('Wrote', out);
await browser.close();
