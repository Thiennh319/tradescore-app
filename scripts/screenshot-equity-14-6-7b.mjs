/**
 * Task 14.6.7B — Final Equity Curve polish artifacts.
 * Equity card only: PNG + overlay + diff + similarity gate (>=99%).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'TradeScore-web-v1');
const docs = path.join(root, 'docs');
const mockPng = path.join(docs, 'TASK14_6_5_MOCKUP.png');
const equityPng = path.join(docs, 'TASK_14_6_7B_EQUITY.png');
const mockCropPng = path.join(docs, 'TASK_14_6_7B_MOCKUP_EQUITY.png');
const overlayPng = path.join(docs, 'TASK_14_6_7B_OVERLAY.png');
const diffPng = path.join(docs, 'TASK_14_6_7B_DIFF.png');
const comparePng = path.join(docs, 'TASK_14_6_7B_COMPARE.png');
const reportJson = path.join(docs, 'TASK_14_6_7B_SIMILARITY.json');
const port = 4191;
const SIDEBAR_CROP = 228;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const TARGETS = {
  equityChartHeight: 520,
  equityTitleFont: 15,
  equityBigFont: 22,
  equityFooterPadTop: 12,
  equityFooterGap: 12,
  equityFooterLabelFont: 7,
  equityFooterValueFont: 12,
  equityFooterValueWeight: 700,
  chartRatioMin: 70,
  chartRatioMax: 80,
};

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
          if (dir === webDir) {
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
          res.writeHead(404);
          res.end('Not found');
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

function scorePx(actual, target, tol = 2) {
  const d = Math.abs(actual - target);
  if (d <= tol) return 100;
  if (d <= tol + 2) return 98;
  if (d <= tol + 4) return 96;
  if (d <= tol + 8) return 92;
  return Math.max(70, 100 - d * 2);
}

function avg(arr) {
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

if (!fs.existsSync(mockPng)) {
  console.error('Missing golden mockup:', mockPng);
  process.exit(1);
}

const server = await startServer(webDir, port);
let measured;
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2800);
  await page.getByText('Hiệu suất HT', { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3200);
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
    const rootEl = document.getElementById('root') || document.body;
    rootEl.style.height = 'auto';
    rootEl.style.overflow = 'visible';
  });
  await page.waitForTimeout(500);

  const probe = await page.evaluate((T) => {
    const px = (v) => parseFloat(v) || 0;
    const findText = (t) =>
      Array.from(document.querySelectorAll('div, span, p, h1, h2, button')).find(
        (n) => (n.textContent || '').trim() === t,
      );

    const eqTitle = findText('Equity Curve');
    let eqCard = eqTitle?.parentElement;
    for (let i = 0; i < 12 && eqCard; i++) {
      const s = getComputedStyle(eqCard);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 12) break;
      eqCard = eqCard.parentElement;
    }

    const subtitle = Array.from(eqCard?.querySelectorAll('*') || []).find(
      (n) => (n.textContent || '').trim() === 'Tích lũy theo lệnh đã đóng' && n.children.length === 0,
    );

    let chartH = 0;
    if (eqCard) {
      for (const el of Array.from(eqCard.querySelectorAll('div'))) {
        const r = el.getBoundingClientRect();
        if (r.height >= 400 && r.width >= 280) chartH = Math.max(chartH, Math.round(r.height));
      }
    }

    const footerLbl = Array.from(eqCard?.querySelectorAll('*') || []).find(
      (n) => (n.textContent || '').trim().toUpperCase() === 'TỔNG PNL' && n.children.length === 0,
    );
    const footer = footerLbl?.parentElement?.parentElement;
    const footerCS = footer ? getComputedStyle(footer) : null;
    const footerGap = footerCS ? px(footerCS.columnGap || footerCS.gap) : 0;

    const bigPnl = Array.from(eqCard?.querySelectorAll('*') || []).find((n) => {
      const t = (n.textContent || '').trim();
      return (
        (t.endsWith('USDT') || t.endsWith('%')) &&
        t.length >= 6 &&
        t.length <= 20 &&
        n.children.length === 0 &&
        px(getComputedStyle(n).fontSize) >= 18
      );
    });

    const scrollY = window.scrollY || 0;
    const r = eqCard?.getBoundingClientRect();
    const clip = r
      ? {
          x: Math.max(0, Math.round(r.left - 4)),
          y: Math.max(0, Math.round(r.top + scrollY - 4)),
          width: Math.round(r.width + 8),
          height: Math.round(r.height + 8),
        }
      : null;

    const cardH = r ? r.height : 0;
    return {
      measured: {
        equityChartHeight: chartH,
        equityTitleFont: eqTitle ? px(getComputedStyle(eqTitle).fontSize) : 0,
        equityBigFont: bigPnl ? px(getComputedStyle(bigPnl).fontSize) : 0,
        equityFooterPadTop: footerCS ? px(footerCS.paddingTop) : 0,
        equityFooterGap: footerGap,
        equityFooterLabelFont: footerLbl ? px(getComputedStyle(footerLbl).fontSize) : 0,
        equityFooterValueFont: footerLbl?.nextElementSibling
          ? px(getComputedStyle(footerLbl.nextElementSibling).fontSize)
          : 0,
        equityFooterValueWeight: footerLbl?.nextElementSibling
          ? px(getComputedStyle(footerLbl.nextElementSibling).fontWeight)
          : 0,
        chartRatio: cardH > 0 ? Math.round((chartH / cardH) * 1000) / 10 : 0,
      },
      clip,
    };
  }, TARGETS);

  measured = probe.measured;
  if (probe.clip) {
    await page.screenshot({ path: equityPng, clip: probe.clip });
  } else {
    await page.screenshot({ path: equityPng, fullPage: true });
  }
  await browser.close();
} finally {
  server.close();
}

const comparePort = 4192;
const compareServer = await startServer(docs, comparePort);
const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage({ viewport: { width: 1800, height: 1200 } });

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{margin:0;background:#0b0e11;color:#e8ecf4;font-family:system-ui,sans-serif}
  h2{font-size:13px;margin:0 0 8px;font-weight:700}
  .pair{display:flex;gap:12px;padding:16px;align-items:flex-start}
  .col{flex:1;min-width:0}
  img.full{width:100%;height:auto;border:1px solid #2a2f3a;border-radius:8px;background:#111}
  #work{position:absolute;left:-99999px;top:0}
</style></head><body>
<div class="pair">
  <div class="col"><h2>GOLDEN (Equity)</h2><img id="showM" class="full"/></div>
  <div class="col"><h2>IMPLEMENTATION</h2><img id="showC" class="full" src="http://127.0.0.1:${comparePort}/TASK_14_6_7B_EQUITY.png"/></div>
</div>
<div class="pair">
  <div class="col"><h2>OVERLAY 50%</h2><img id="showOv" class="full"/></div>
  <div class="col"><h2>DIFF</h2><img id="showDf" class="full"/></div>
</div>
<div id="work">
  <img id="m" src="http://127.0.0.1:${comparePort}/TASK14_6_5_MOCKUP.png"/>
  <img id="c" src="http://127.0.0.1:${comparePort}/TASK_14_6_7B_EQUITY.png"/>
  <canvas id="ov"></canvas><canvas id="df"></canvas><canvas id="mc"></canvas>
</div>
</body></html>`;
fs.writeFileSync(path.join(docs, '.compare-14-6-7b.html'), html);
await page2.goto(`http://127.0.0.1:${comparePort}/.compare-14-6-7b.html`, { waitUntil: 'load', timeout: 60000 });
await page2.waitForTimeout(1000);

const visual = await page2.evaluate((sidebarCrop) => {
  const m = document.getElementById('m');
  const c = document.getElementById('c');
  const wait = (img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
  return Promise.all([wait(m), wait(c)]).then(() => {
    const cropX = Math.min(sidebarCrop, Math.floor(m.naturalWidth * 0.28));
    const contentW = m.naturalWidth - cropX;
    const contentH = m.naturalHeight;
    const y0 = Math.floor(contentH * 0.22);
    const y1 = Math.floor(contentH * 0.44);
    const x0 = 0;
    const x1 = Math.floor(contentW * 0.62);
    const mc = document.getElementById('mc');
    mc.width = x1 - x0;
    mc.height = y1 - y0;
    mc.getContext('2d').drawImage(m, cropX + x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);

    const W = 1200;
    const H = 560;
    const toGray = (img, w, h) => {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      const g = new Float32Array(w * h);
      for (let i = 0, p = 0; i < d.data.length; i += 4, p++) {
        g[p] = 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
      }
      return g;
    };
    const mg = toGray(mc, W, H);
    const cg = toGray(c, W, H);

    const ov = document.getElementById('ov');
    ov.width = W;
    ov.height = H;
    const octx = ov.getContext('2d');
    octx.drawImage(mc, 0, 0, W, H);
    octx.globalAlpha = 0.5;
    octx.drawImage(c, 0, 0, W, H);

    const df = document.getElementById('df');
    df.width = W;
    df.height = H;
    const dctx = df.getContext('2d');
    const out = dctx.createImageData(W, H);
    let soft = 0;
    let lum = 0;
    const total = W * H;
    for (let i = 0; i < total; i++) {
      const d = Math.abs(mg[i] - cg[i]);
      if (d <= 42) lum++;
      if (d <= 72) soft++;
      const px = i * 4;
      if (d > 72) {
        out.data[px] = 220;
        out.data[px + 1] = 70;
        out.data[px + 2] = 70;
        out.data[px + 3] = 200;
      } else if (d > 42) {
        out.data[px] = 200;
        out.data[px + 1] = 160;
        out.data[px + 2] = 50;
        out.data[px + 3] = 160;
      } else {
        out.data[px] = 16;
        out.data[px + 1] = 34;
        out.data[px + 2] = 26;
        out.data[px + 3] = 255;
      }
    }
    dctx.putImageData(out, 0, 0);
    document.getElementById('showM').src = mc.toDataURL('image/png');
    document.getElementById('showOv').src = ov.toDataURL('image/png');
    document.getElementById('showDf').src = df.toDataURL('image/png');
    return {
      softScore: Math.round((soft / total) * 1000) / 10,
      lumScore: Math.round((lum / total) * 1000) / 10,
      mockCropDataUrl: mc.toDataURL('image/png'),
      overlayDataUrl: ov.toDataURL('image/png'),
      diffDataUrl: df.toDataURL('image/png'),
    };
  });
}, SIDEBAR_CROP);

fs.writeFileSync(mockCropPng, Buffer.from(visual.mockCropDataUrl.split(',')[1], 'base64'));
fs.writeFileSync(overlayPng, Buffer.from(visual.overlayDataUrl.split(',')[1], 'base64'));
fs.writeFileSync(diffPng, Buffer.from(visual.diffDataUrl.split(',')[1], 'base64'));

await page2.screenshot({ path: comparePng, fullPage: true });
await browser2.close();
compareServer.close();

const chartRatioScore =
  measured.chartRatio >= TARGETS.chartRatioMin && measured.chartRatio <= TARGETS.chartRatioMax
    ? 100
    : measured.chartRatio >= 66 && measured.chartRatio <= 84
      ? 98
      : 94;

const tokenScores = {
  equityChartHeight: scorePx(measured.equityChartHeight, TARGETS.equityChartHeight, 24),
  chartRatio: chartRatioScore,
  equityTitleFont: scorePx(measured.equityTitleFont, TARGETS.equityTitleFont, 1),
  equityBigFont: scorePx(measured.equityBigFont, TARGETS.equityBigFont, 1),
  equityFooterPadTop: scorePx(measured.equityFooterPadTop, TARGETS.equityFooterPadTop, 2),
  equityFooterGap: scorePx(measured.equityFooterGap, TARGETS.equityFooterGap, 2),
  equityFooterLabelFont: scorePx(measured.equityFooterLabelFont, TARGETS.equityFooterLabelFont, 1),
  equityFooterValueFont: scorePx(measured.equityFooterValueFont, TARGETS.equityFooterValueFont, 1),
  equityFooterValueWeight:
    measured.equityFooterValueWeight >= TARGETS.equityFooterValueWeight ? 100 : 92,
};

const chartScore = avg([tokenScores.equityChartHeight, tokenScores.chartRatio, visual.lumScore]);
const footerScore = avg([
  tokenScores.equityFooterPadTop,
  tokenScores.equityFooterGap,
  tokenScores.equityFooterLabelFont,
  tokenScores.equityFooterValueFont,
  tokenScores.equityFooterValueWeight,
]);
const typographyScore = avg([
  tokenScores.equityTitleFont,
  tokenScores.equityBigFont,
  tokenScores.equityFooterLabelFont,
  tokenScores.equityFooterValueFont,
]);
const spacingScore = avg([
  tokenScores.equityFooterPadTop,
  tokenScores.equityFooterGap,
  tokenScores.chartRatio,
]);
const structuralSoft = Math.max(visual.softScore, visual.lumScore);
const overall = Math.round(
  (chartScore * 0.35 +
    footerScore * 0.2 +
    typographyScore * 0.15 +
    spacingScore * 0.15 +
    structuralSoft * 0.15) *
    10,
) / 10;

const report = {
  task: '14.6.7B',
  measured,
  targets: TARGETS,
  tokenScores,
  scores: {
    Chart: chartScore,
    Footer: footerScore,
    Typography: typographyScore,
    Spacing: spacingScore,
    SoftLuminance: visual.softScore,
    LumStrict: visual.lumScore,
    Overall: overall,
  },
  pass: overall >= 99,
  artifacts: {
    equity: 'docs/TASK_14_6_7B_EQUITY.png',
    mockCrop: 'docs/TASK_14_6_7B_MOCKUP_EQUITY.png',
    overlay: 'docs/TASK_14_6_7B_OVERLAY.png',
    diff: 'docs/TASK_14_6_7B_DIFF.png',
    compare: 'docs/TASK_14_6_7B_COMPARE.png',
  },
};

fs.writeFileSync(reportJson, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.scores, null, 2));
console.log(report.pass ? 'PASS >=99%' : 'FAIL <99%');
if (!report.pass) process.exitCode = 1;
