/**
 * Task 14.6.2 — Capture full-page Desktop Performance tab PNG.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'TradeScore-web-v1');
const outPng = path.join(root, 'docs', 'TASK14_6_2_PERFORMANCE_TAB.png');
const port = 4174;
const require = createRequire(import.meta.url);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
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

if (!fs.existsSync(path.join(webDir, 'index.html'))) {
  console.error('Missing TradeScore-web-v1/index.html — run npm run build first');
  process.exit(1);
}

const { chromium } = require('playwright');
const server = await startServer();
try {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await page.getByText('Hiệu suất HT', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      const s = window.getComputedStyle(el);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflow === 'auto' || s.overflow === 'scroll') {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
      }
    });
    const root = document.getElementById('root') || document.body;
    root.style.height = 'auto';
    root.style.overflow = 'visible';
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPng, fullPage: true });
  await browser.close();
  console.log('PNG:', outPng);
} finally {
  server.close();
}
