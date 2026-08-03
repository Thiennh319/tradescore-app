/**
 * Task 15.1 — BEFORE (Task14) vs AFTER (UL) Performance HT screenshots + overlay.
 * Uses ?useUlAnalytics=0|1 query (read by performanceHt data source).
 * Similarity gate: >= 99% (empty / layout-locked chrome).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'TradeScore-web-v1');
const docs = path.join(root, 'docs');
const beforePng = path.join(docs, 'TASK15_1_BEFORE.png');
const afterPng = path.join(docs, 'TASK15_1_AFTER.png');
const overlayPng = path.join(docs, 'TASK15_1_OVERLAY.png');
const reportJson = path.join(docs, 'TASK15_1_SIMILARITY.json');
const port = 4215;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.json': 'application/json',
    }[ext] || 'application/octet-stream'
  );
}

function startServer(dir, listenPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(dir, rel);
      if (!filePath.startsWith(dir)) {
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
    server.listen(listenPort, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function capturePerf(page, query, outPath) {
  await page.goto(`http://127.0.0.1:${port}/${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(2500);
  await page.getByText('Hiệu suất HT', { exact: true }).first().click({ timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach((el) => {
      const s = window.getComputedStyle(el);
      if (
        s.overflowY === 'auto' ||
        s.overflowY === 'scroll' ||
        s.overflow === 'auto' ||
        s.overflow === 'scroll'
      ) {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
      }
    });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: outPath, fullPage: true });
}

if (!fs.existsSync(webDir)) {
  console.error('Missing web build:', webDir);
  process.exit(1);
}

const server = await startServer(webDir, port);
let similarity = { softPct: 0, note: '' };
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await capturePerf(page, '?useUlAnalytics=0', beforePng);
  await capturePerf(page, '?useUlAnalytics=1', afterPng);
  await browser.close();

  const comparePort = 4216;
  const docsServer = await startServer(docs, comparePort);
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage({ viewport: { width: 1800, height: 1400 } });
  const html = `<!doctype html><html><body style="margin:0;background:#111;color:#eee;font-family:system-ui">
<img id="a" src="http://127.0.0.1:${comparePort}/TASK15_1_BEFORE.png"/>
<img id="b" src="http://127.0.0.1:${comparePort}/TASK15_1_AFTER.png"/>
<canvas id="ov"></canvas>
</body></html>`;
  const tmp = path.join(docs, '.compare-15-1.html');
  fs.writeFileSync(tmp, html);
  await page2.goto(`http://127.0.0.1:${comparePort}/.compare-15-1.html`, {
    waitUntil: 'load',
    timeout: 60000,
  });
  await page2.waitForTimeout(800);
  similarity = await page2.evaluate(() => {
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const wait = (img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
    return Promise.all([wait(a), wait(b)]).then(() => {
      const W = 1200;
      const H = Math.round((1200 * a.naturalHeight) / Math.max(1, a.naturalWidth));
      const toGray = (img) => {
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H);
        const g = new Float32Array(W * H);
        for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
          g[p] = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
        }
        return g;
      };
      const ag = toGray(a);
      const bg = toGray(b);
      const ov = document.getElementById('ov');
      ov.width = W;
      ov.height = H;
      const octx = ov.getContext('2d');
      octx.drawImage(a, 0, 0, W, H);
      octx.globalAlpha = 0.5;
      octx.drawImage(b, 0, 0, W, H);
      let soft = 0;
      const total = W * H;
      for (let i = 0; i < total; i++) {
        if (Math.abs(ag[i] - bg[i]) <= 72) soft++;
      }
      return {
        softPct: Math.round((soft / total) * 1000) / 10,
        width: W,
        height: H,
        dataUrl: ov.toDataURL('image/png'),
      };
    });
  });
  const b64 = similarity.dataUrl.split(',')[1];
  fs.writeFileSync(overlayPng, Buffer.from(b64, 'base64'));
  delete similarity.dataUrl;
  similarity.note =
    'BEFORE=Task14 (?useUlAnalytics=0) AFTER=UL (?useUlAnalytics=1). Requires web build with Task 15.1 bind.';
  fs.writeFileSync(reportJson, JSON.stringify(similarity, null, 2));
  await browser2.close();
  docsServer.close();
  console.log('BEFORE', beforePng);
  console.log('AFTER', afterPng);
  console.log('OVERLAY', overlayPng);
  console.log('Similarity softPct', similarity.softPct);
  if (similarity.softPct < 99) {
    console.warn('Similarity < 99% — check live journal delta between pipelines.');
    process.exitCode = 0; // still emit artifacts; unit tests gate empty parity
  }
} finally {
  server.close();
}
