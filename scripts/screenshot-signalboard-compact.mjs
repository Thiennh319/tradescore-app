/**
 * Capture real SignalBoard UI screenshots (mobile compact + desktop grid).
 * Requires: npm run start:web (http://localhost:8081)
 *
 * Usage: node scripts/screenshot-signalboard-compact.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'exports', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.TRADESCORE_WEB_URL ?? 'http://localhost:8081';

async function openV3V4(page) {
  const v3v4 = page.getByText('V3/V4', { exact: true }).first();
  await v3v4.waitFor({ timeout: 60_000 });
  await v3v4.click();
  await page.waitForTimeout(1000);
}

async function waitForCompactList(page) {
  await page.getByText(/Tất cả \(\d+\)/).first().waitFor({ timeout: 180_000 });
  // Prefer All so rows are visible even when Ready=0
  await page.getByText(/Tất cả \(\d+\)/).first().click();
  await page.waitForTimeout(400);
  await page.getByText(/\/USDT/).first().waitFor({ timeout: 60_000 });
  await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('*')).find((el) =>
      /Sẵn sàng \(\d+\)/.test(el.textContent ?? ''),
    );
    hit?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
}

async function shotClipFromFilter(page, name) {
  const path = join(OUT, name);
  const filter = page.getByText(/Sẵn sàng \(\d+\)/).first();
  await filter.scrollIntoViewIfNeeded();
  // Clip viewport around filter + list (not full app chrome)
  const box = await filter.boundingBox();
  if (box) {
    const viewport = page.viewportSize() ?? { width: 390, height: 844 };
    await page.screenshot({
      path,
      clip: {
        x: 0,
        y: Math.max(0, box.y - 8),
        width: viewport.width,
        height: Math.min(viewport.height - 8, viewport.height - Math.max(0, box.y - 8)),
      },
    });
  } else {
    await page.screenshot({ path, fullPage: false });
  }
  console.log('saved', path);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // --- Mobile compact ---
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await openV3V4(mobile);
  await waitForCompactList(mobile);
  await shotClipFromFilter(mobile, 'signalboard_mobile_compact_collapsed_2026-08-09.png');

  // Expand first row
  const pair = mobile.getByText(/BTC\/USDT|NEAR\/USDT|\/USDT/).first();
  await pair.click();
  await mobile.waitForTimeout(700);
  await shotClipFromFilter(mobile, 'signalboard_mobile_compact_expand_2026-08-09.png');

  // --- Desktop grid ---
  const desk = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await desk.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await openV3V4(desk);
  await desk.getByText(/BTC\/USDT/).first().waitFor({ timeout: 180_000 });
  await desk.evaluate(() => {
    const hit = Array.from(document.querySelectorAll('*')).find((el) =>
      (el.textContent ?? '').includes('BTC/USDT'),
    );
    hit?.scrollIntoView({ block: 'center' });
  });
  await desk.waitForTimeout(500);
  await desk.screenshot({
    path: join(OUT, 'signalboard_desktop_card_grid_2026-08-09.png'),
    fullPage: false,
  });
  console.log('saved', join(OUT, 'signalboard_desktop_card_grid_2026-08-09.png'));

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
