/**
 * Task 14.6.3 — Side-by-side mockup vs implementation PNG.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'TradeScore-web-v1');
const implPng = path.join(root, 'docs', 'TASK14_6_3_IMPLEMENTATION.png');
const mockPng = path.join(root, 'docs', 'TASK14_6_3_MOCKUP.png');
const comparePng = path.join(root, 'docs', 'TASK14_6_3_COMPARE.png');
const port = 4176;
const require = createRequire(import.meta.url);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
    }[ext] || 'application/octet-stream'
  );
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(webDir, rel);
      if (!filePath.startsWith(webDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(path.join(webDir, 'index.html'), (err2, html) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

const { chromium } = require('playwright');

// 1) Capture implementation
const server = await startServer();
try {
  fs.mkdirSync(path.dirname(implPng), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2800);
  await page.getByText('Hiệu suất HT', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      const s = window.getComputedStyle(el);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflow === 'auto' || s.overflow === 'scroll') {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
      }
    });
    const rootEl = document.getElementById('root') || document.body;
    rootEl.style.height = 'auto';
    rootEl.style.overflow = 'visible';
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: implPng, fullPage: true });
  await browser.close();
  console.log('IMPL:', implPng);
} finally {
  server.close();
}

if (!fs.existsSync(mockPng)) {
  console.error('Missing mockup PNG:', mockPng);
  process.exit(1);
}

// Also keep legacy path
fs.copyFileSync(implPng, path.join(root, 'docs', 'TASK14_6_2_PERFORMANCE_TAB.png'));

// 2) Side-by-side HTML screenshot
const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{margin:0;background:#0b0e11;font-family:system-ui,sans-serif;color:#e8ecf4}
  .row{display:flex;gap:12px;padding:16px;align-items:flex-start}
  .col{flex:1;min-width:0}
  h2{font-size:14px;margin:0 0 8px;font-weight:700;letter-spacing:.3px}
  img{width:100%;height:auto;border:1px solid #2a2f3a;border-radius:8px;background:#111}
</style></head><body>
<div class="row">
  <div class="col"><h2>MOCKUP (approved)</h2><img id="m" src="file:///${mockPng.replace(/\\/g, '/')}"/></div>
  <div class="col"><h2>IMPLEMENTATION</h2><img id="i" src="file:///${implPng.replace(/\\/g, '/')}"/></div>
</div>
</body></html>`;

const tmpHtml = path.join(root, 'docs', '.compare-14-6-3.html');
fs.writeFileSync(tmpHtml, html, 'utf8');

const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage({ viewport: { width: 1920, height: 1080 } });
await page2.goto(`file:///${tmpHtml.replace(/\\/g, '/')}`, { waitUntil: 'load', timeout: 60000 });
await page2.waitForTimeout(1500);
await page2.evaluate(() => {
  document.body.style.height = 'auto';
  document.documentElement.style.height = 'auto';
});
await page2.screenshot({ path: comparePng, fullPage: true });
await browser2.close();
try { fs.unlinkSync(tmpHtml); } catch {}
console.log('COMPARE:', comparePng);
