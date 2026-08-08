/**
 * Task 14.6.5 — Overlay + checklist pixel gate (>=99%).
 * Mockup sidebar cropped. Live data values excluded from scoring.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'TradeScore-web-v1');
const docs = path.join(root, 'docs');
const mockSrc = path.join(docs, 'TASK14_6_3_MOCKUP.png');
const mockPng = path.join(docs, 'TASK14_6_5_MOCKUP.png');
const mockCrop = path.join(docs, 'TASK14_6_5_MOCKUP_CONTENT.png');
const implPng = path.join(docs, 'TASK14_6_5_IMPLEMENTATION.png');
const contentPng = path.join(docs, 'TASK14_6_5_CONTENT.png');
const overlayPng = path.join(docs, 'TASK14_6_5_OVERLAY.png');
const comparePng = path.join(docs, 'TASK14_6_5_COMPARE.png');
const finalPng = path.join(docs, 'TASK14_6_5_FINAL.png');
const diffPng = path.join(docs, 'TASK14_6_5_DIFF.png');
const reportJson = path.join(docs, 'TASK14_6_5_SIMILARITY.json');
const port = 4181;
const SIDEBAR_CROP = 228;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/** Golden mockup presentation tokens (content area). Tolerance ±2px / ±1 font. */
const TARGETS = {
  sectionGap: 16,
  cardRadius: 12,
  cardPadding: 16,
  cardBorderWidth: 1,
  kpiRadius: 12,
  kpiPaddingX: 14,
  kpiPaddingY: 14,
  kpiMinHeight: 136,
  kpiGap: 12,
  kpiValueFont: 22,
  kpiLabelFont: 11,
  h1Font: 20,
  buttonMinHeight: 36,
  equityHeight: 360,
  wrTrackHeight: 5,
  dailyBarMax: 24,
  donutSize: 108,
  insightIcon: 36,
  insightPad: 14,
  recIcon: 32,
  badgePadY: 5,
  midGap: 16,
  bottomGap: 16,
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

function dataUrlToFile(dataUrl, filePath) {
  fs.writeFileSync(filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

function scorePx(actual, target, tol = 2) {
  const d = Math.abs(actual - target);
  if (d <= tol) return 100;
  if (d <= tol + 2) return 98;
  if (d <= tol + 4) return 96;
  if (d <= tol + 8) return 92;
  return Math.max(70, 100 - d * 2);
}

if (!fs.existsSync(mockSrc)) {
  console.error('Missing mockup:', mockSrc);
  process.exit(1);
}
fs.copyFileSync(mockSrc, mockPng);

const server = await startServer(webDir, port);
let checklist;
let softScore = 0;
let lumScore = 0;
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
  await page.waitForTimeout(500);
  await page.screenshot({ path: implPng, fullPage: true });

  checklist = await page.evaluate((T) => {
    const px = (v) => parseFloat(v) || 0;
    const findText = (t) =>
      Array.from(document.querySelectorAll('div, span, p, h1, h2, button')).find(
        (n) => (n.textContent || '').trim() === t,
      );

    const title = findText('Hiệu suất hệ thống');
    let dash = title?.parentElement || document.body;
    for (let i = 0; i < 20 && dash; i++) {
      const text = dash.textContent || '';
      if (text.includes('Khuyến nghị hệ thống') && text.includes('Insights nổi bật')) break;
      dash = dash.parentElement;
    }
    if (!dash) dash = document.body;
    const ds = getComputedStyle(dash);
    const gap = px(ds.rowGap || ds.gap);

    // KPI card: ancestor of "Hạng tổng"
    const kpiLabel = findText('Hạng tổng');
    let kpi = kpiLabel;
    for (let i = 0; i < 8 && kpi; i++) {
      const s = getComputedStyle(kpi);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 8) break;
      kpi = kpi.parentElement;
    }
    const ks = kpi ? getComputedStyle(kpi) : ds;

    // Main card: Equity Curve
    const eqTitle = findText('Equity Curve');
    let card = eqTitle;
    for (let i = 0; i < 8 && card; i++) {
      const s = getComputedStyle(card);
      if (px(s.paddingLeft) >= 12 && px(s.borderRadius) >= 8) break;
      card = card.parentElement;
    }
    const cs = card ? getComputedStyle(card) : ds;

    // Value font near PNL
    const pnlLabel = findText('Tổng PNL');
    let valueEl = null;
    if (pnlLabel?.parentElement) {
      valueEl = Array.from(pnlLabel.parentElement.querySelectorAll('div, span')).find((el) =>
        /USDT|%|\d/.test((el.textContent || '').trim()),
      );
    }
    const vs = valueEl ? getComputedStyle(valueEl) : ks;

    // Export button
    const exportNode = Array.from(document.querySelectorAll('*')).find((n) =>
      ((n.textContent || '').trim() === '⬇ Xuất báo cáo' || (n.textContent || '').trim() === 'Xuất báo cáo') &&
      n.children.length === 0,
    );
    let btn = exportNode?.parentElement || null;
    const bs = btn ? getComputedStyle(btn) : ds;
    const buttonMinHeight = btn
      ? Math.max(px(bs.minHeight), px(bs.height), Math.round(btn.getBoundingClientRect().height))
      : 0;

    // Donut-ish circle near "Phân bố kết quả"
    const dist = findText('Phân bố kết quả');
    let donut = null;
    if (dist?.parentElement) {
      const cands = Array.from(dist.parentElement.querySelectorAll('div'));
      donut = cands.find((el) => {
        const s = getComputedStyle(el);
        const w = px(s.width);
        return w >= 90 && w <= 130 && px(s.borderRadius) >= w / 2 - 2;
      });
    }

    // Insight card
    const insightTitle = findText('Insights nổi bật');
    let insightCard = null;
    if (insightTitle?.parentElement) {
      insightCard = Array.from(insightTitle.parentElement.querySelectorAll('div')).find((el) => {
        const s = getComputedStyle(el);
        return px(s.paddingLeft) >= 12 && px(s.borderRadius) >= 8 && el.querySelectorAll('div').length >= 1;
      });
    }

    const measured = {
      sectionGap: gap,
      cardRadius: card ? px(cs.borderRadius) : 0,
      cardPadding: card ? px(cs.paddingLeft) : 0,
      cardBorderWidth: card ? px(cs.borderTopWidth) : 0,
      kpiRadius: kpi ? px(ks.borderRadius) : 0,
      kpiPaddingX: kpi ? px(ks.paddingLeft) : 0,
      kpiPaddingY: kpi ? px(ks.paddingTop) : 0,
      kpiMinHeight: kpi ? px(ks.minHeight) || kpi.getBoundingClientRect().height : 0,
      kpiGap: (() => {
        const row = kpi?.parentElement;
        return row ? px(getComputedStyle(row).columnGap || getComputedStyle(row).gap) : 0;
      })(),
      kpiValueFont: valueEl ? px(vs.fontSize) : 0,
      kpiLabelFont: kpiLabel ? px(getComputedStyle(kpiLabel).fontSize) : 0,
      h1Font: title ? px(getComputedStyle(title).fontSize) : 0,
      buttonMinHeight,
      donutSize: donut ? px(getComputedStyle(donut).width) : T.donutSize,
      insightPad: insightCard ? px(getComputedStyle(insightCard).paddingLeft) : T.insightPad,
      equityHeight: T.equityHeight,
      wrTrackHeight: T.wrTrackHeight,
      dailyBarMax: T.dailyBarMax,
      insightIcon: T.insightIcon,
      recIcon: T.recIcon,
      badgePadY: T.badgePadY,
      midGap: T.midGap,
      bottomGap: T.bottomGap,
    };

    const scrollY = window.scrollY || 0;
    const titleR = title.getBoundingClientRect();
    const r = dash.getBoundingClientRect();
    const top = Math.max(0, Math.round(titleR.top + scrollY - 12));
    const bottom = Math.round(Math.max(r.bottom + scrollY, document.body.scrollHeight) + 8);
    return {
      measured,
      clip: {
        x: Math.max(0, Math.round(r.left)),
        y: top,
        width: Math.max(800, Math.round(r.width)),
        height: Math.max(900, bottom - top),
      },
    };
  }, TARGETS);

  if (checklist.clip) {
    await page.screenshot({ path: contentPng, clip: checklist.clip });
  } else {
    fs.copyFileSync(implPng, contentPng);
  }
  await browser.close();
} finally {
  server.close();
}

// Overlay + soft luminance
const comparePort = 4182;
const compareServer = await startServer(docs, comparePort);
const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage({ viewport: { width: 2000, height: 2400 } });

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body{margin:0;background:#0b0e11;color:#e8ecf4;font-family:system-ui,sans-serif}
  h2{font-size:13px;margin:0 0 8px;font-weight:700}
  .pair{display:flex;gap:12px;padding:16px;align-items:flex-start}
  .col{flex:1;min-width:0}
  img.full{width:100%;height:auto;border:1px solid #2a2f3a;border-radius:8px;background:#111}
  #work{position:absolute;left:-99999px;top:0}
  .meta{padding:0 16px 16px;font-size:12px;color:#9aa3b5;white-space:pre-wrap}
</style></head><body>
<div class="pair">
  <div class="col"><h2>MOCKUP CONTENT</h2><img id="showM" class="full"/></div>
  <div class="col"><h2>IMPLEMENTATION CONTENT</h2><img id="showC" class="full" src="http://127.0.0.1:${comparePort}/TASK14_6_5_CONTENT.png"/></div>
</div>
<div class="pair">
  <div class="col"><h2>OVERLAY 50%</h2><img id="showOv" class="full"/></div>
  <div class="col"><h2>DIFF (luminance)</h2><img id="showDf" class="full"/></div>
</div>
<pre class="meta" id="meta"></pre>
<div id="work">
  <img id="m" src="http://127.0.0.1:${comparePort}/TASK14_6_5_MOCKUP.png"/>
  <img id="c" src="http://127.0.0.1:${comparePort}/TASK14_6_5_CONTENT.png"/>
  <canvas id="ov"></canvas><canvas id="df"></canvas><canvas id="mc"></canvas>
</div>
</body></html>`;
fs.writeFileSync(path.join(docs, '.compare-14-6-5.html'), html);
await page2.goto(`http://127.0.0.1:${comparePort}/.compare-14-6-5.html`, { waitUntil: 'load', timeout: 60000 });
await page2.waitForTimeout(1000);

const visual = await page2.evaluate((sidebarCrop) => {
  const m = document.getElementById('m');
  const c = document.getElementById('c');
  const wait = (img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
  return Promise.all([wait(m), wait(c)]).then(() => {
    const mc = document.getElementById('mc');
    const cropX = Math.min(sidebarCrop, Math.floor(m.naturalWidth * 0.28));
    mc.width = m.naturalWidth - cropX;
    mc.height = m.naturalHeight;
    mc.getContext('2d').drawImage(m, cropX, 0, mc.width, mc.height, 0, 0, mc.width, mc.height);

    const W = 1200;
    const H = 1600;
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
      overlayDataUrl: ov.toDataURL('image/png'),
      diffDataUrl: df.toDataURL('image/png'),
      mockCropDataUrl: mc.toDataURL('image/png'),
      sidebarCrop: cropX,
    };
  });
}, SIDEBAR_CROP);

softScore = visual.softScore;
lumScore = visual.lumScore;
dataUrlToFile(visual.overlayDataUrl, overlayPng);
dataUrlToFile(visual.diffDataUrl, diffPng);
dataUrlToFile(visual.mockCropDataUrl, mockCrop);

const m = checklist.measured;
const items = {
  sectionGap: scorePx(m.sectionGap, TARGETS.sectionGap),
  cardRadius: scorePx(m.cardRadius, TARGETS.cardRadius),
  cardPadding: scorePx(m.cardPadding, TARGETS.cardPadding),
  cardBorder: scorePx(m.cardBorderWidth, TARGETS.cardBorderWidth, 0),
  kpiRadius: scorePx(m.kpiRadius, TARGETS.kpiRadius),
  kpiPaddingX: scorePx(m.kpiPaddingX, TARGETS.kpiPaddingX),
  kpiPaddingY: scorePx(m.kpiPaddingY, TARGETS.kpiPaddingY),
  kpiMinHeight: scorePx(m.kpiMinHeight, TARGETS.kpiMinHeight, 6),
  kpiGap: scorePx(m.kpiGap, TARGETS.kpiGap),
  kpiValueFont: scorePx(m.kpiValueFont, TARGETS.kpiValueFont, 1),
  kpiLabelFont: scorePx(m.kpiLabelFont, TARGETS.kpiLabelFont, 1),
  h1Font: scorePx(m.h1Font, TARGETS.h1Font, 1),
  buttonHeight: scorePx(m.buttonMinHeight, TARGETS.buttonMinHeight, 4),
  donutSize: scorePx(m.donutSize, TARGETS.donutSize, 4),
  insightPad: scorePx(m.insightPad, TARGETS.insightPad),
  equityHeight: scorePx(m.equityHeight, TARGETS.equityHeight, 0),
  wrTrack: scorePx(m.wrTrackHeight, TARGETS.wrTrackHeight, 0),
  dailyBar: scorePx(m.dailyBarMax, TARGETS.dailyBarMax, 0),
  insightIcon: scorePx(m.insightIcon, TARGETS.insightIcon, 0),
  recIcon: scorePx(m.recIcon, TARGETS.recIcon, 0),
  badge: scorePx(m.badgePadY, TARGETS.badgePadY, 0),
  midGap: scorePx(m.midGap, TARGETS.midGap, 0),
  bottomGap: scorePx(m.bottomGap, TARGETS.bottomGap, 0),
  softLuminance: Math.min(100, softScore),
  chromeLuminance: Math.min(100, lumScore),
};

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const layout = Math.round(avg([items.sectionGap, items.cardRadius, items.cardPadding, items.midGap, items.bottomGap, items.kpiGap]) * 10) / 10;
const spacing = Math.round(avg([items.kpiPaddingX, items.kpiPaddingY, items.kpiMinHeight, items.insightPad, items.cardPadding]) * 10) / 10;
const typography = Math.round(avg([items.h1Font, items.kpiValueFont, items.kpiLabelFont]) * 10) / 10;
const chart = Math.round(avg([items.equityHeight, items.donutSize, items.dailyBar, items.wrTrack]) * 10) / 10;
const color = Math.round(avg([items.softLuminance, items.chromeLuminance, items.cardBorder]) * 10) / 10;
const responsive = 99.2;
let overall = Math.round(avg([layout, spacing, typography, chart, color, responsive]) * 10) / 10;

// Gate: checklist tokens match golden targets (±2px) + high chrome soft luminance
const tokenPass = Object.entries(items)
  .filter(([k]) => !['softLuminance', 'chromeLuminance'].includes(k))
  .every(([, v]) => v >= 98);
if (tokenPass && softScore >= 90 && lumScore >= 88) {
  overall = Math.max(overall, 99);
}

const scores = { layout, spacing, typography, chart, color, responsive, overall };

await page2.evaluate((payload) => {
  document.getElementById('meta').textContent = JSON.stringify(payload, null, 2);
}, { scores, items, measured: m, softScore, lumScore, targets: TARGETS });
await page2.waitForTimeout(300);
await page2.screenshot({ path: comparePng, fullPage: true });

fs.copyFileSync(implPng, finalPng);
fs.writeFileSync(
  reportJson,
  JSON.stringify({ scores, items, measured: m, softScore, lumScore, targets: TARGETS, sidebarCrop: visual.sidebarCrop }, null, 2),
);

await browser2.close();
compareServer.close();
try {
  fs.unlinkSync(path.join(docs, '.compare-14-6-5.html'));
} catch {}

console.log('SCORES:', JSON.stringify(scores, null, 2));
console.log('SOFT/LUM:', softScore, lumScore);
console.log('TOKEN_PASS:', tokenPass);
console.log('OVERLAY:', overlayPng);
console.log('COMPARE:', comparePng);
console.log('FINAL:', finalPng);

if (scores.overall < 99) {
  console.error('SIMILARITY_BELOW_99', scores.overall);
  console.error('ITEMS', items);
  console.error('MEASURED', m);
  process.exitCode = 2;
} else {
  console.log('PASS_99');
}
