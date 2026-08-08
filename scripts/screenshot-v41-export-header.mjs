import { chromium } from 'playwright';
import path from 'node:path';

const out = path.resolve('docs/outputs/v41-export-header-live.png');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForTimeout(4000);

await page.getByText('V4.1', { exact: true }).first().click({ timeout: 20000 });
await page.waitForTimeout(6000);

const exportBtn = page.getByText('📄 Export').first();
await exportBtn.waitFor({ timeout: 20000 });
await exportBtn.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

await page.screenshot({ path: out, fullPage: false });
console.log('Wrote', out);
await browser.close();
