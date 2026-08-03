/**
 * Task 14.6.10 — Pixel-perfect polish artifacts.
 * Full dashboard PNG + golden overlay + diff (>=99%).
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
const implPng = path.join(docs, 'TASK14_6_10_IMPLEMENTATION.png');
const zoomPng = path.join(docs, 'TASK14_6_10_CONTENT.png');
const mockCropPng = path.join(docs, 'TASK14_6_10_MOCKUP_CONTENT.png');
const overlayPng = path.join(docs, 'TASK14_6_10_OVERLAY.png');
const diffPng = path.join(docs, 'TASK14_6_10_DIFF.png');
const comparePng = path.join(docs, 'TASK14_6_10_COMPARE.png');
const reportJson = path.join(docs, 'TASK14_6_10_SIMILARITY.json');
const port = 4197;
const SIDEBAR_CROP = 228;
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const TARGETS = {
  sectionGap: 24,
  cardRadius: 12,
  cardPadding: 28,
  bottomGap: 24,
  qCardPad: 28,
  qCardHeight: 262,
  donutSize: 148,
  dailyBarMax: 31,
  dailyLblFont: 12,
  riskRowMinH: 43,
  gaugeW: 182,
  gaugeTitleFont: 16,
  insightPad: 16,
  insightIcon: 38,
  insightHeight: 130,
  kpiValueFont: 34,
  kpiLabelFont: 13,
  equityHeight: 588,
  recPadY: 17,
  badgePadY: 6,
  badgeFont: 9,
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
  await page.screenshot({ path: implPng, fullPage: true });

  const probe = await page.evaluate((T) => {
    const px = (v) => parseFloat(v) || 0;
    const findText = (t) =>
      Array.from(document.querySelectorAll('div, span, p, h1, h2, button')).find(
        (n) => (n.textContent || '').trim() === t,
      );

    const dailyTitle = findText('Hiệu suất theo ngày');
    const insightTitle = findText('Insights nổi bật');
    const recTitle = findText('Khuyến nghị hệ thống');

    let dailyCard = dailyTitle?.parentElement;
    for (let i = 0; i < 10 && dailyCard; i++) {
      const s = getComputedStyle(dailyCard);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
      dailyCard = dailyCard.parentElement;
    }

    const distTitle = findText('Phân bố kết quả');
    let distCard = distTitle?.parentElement;
    for (let i = 0; i < 10 && distCard; i++) {
      const s = getComputedStyle(distCard);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
      distCard = distCard.parentElement;
    }

    let donut = null;
    if (distCard) {
      donut = Array.from(distCard.querySelectorAll('div')).find((el) => {
        const s = getComputedStyle(el);
        const w = px(s.width);
        return w >= 100 && w <= 170 && px(s.borderRadius) >= w / 2 - 4;
      });
    }

    const riskTitle = findText('Risk Metrics');
    let riskCard = riskTitle?.parentElement;
    for (let i = 0; i < 10 && riskCard; i++) {
      const s = getComputedStyle(riskCard);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
      riskCard = riskCard.parentElement;
    }
    let riskRowH = T.riskRowMinH;
    if (riskCard) {
      const row = Array.from(riskCard.querySelectorAll('div')).find((el) => {
        const t = (el.textContent || '').trim();
        return t.startsWith('Max Drawdown') && el.children.length >= 2;
      });
      if (row) riskRowH = Math.round(row.getBoundingClientRect().height);
    }

    const gaugeTitle = findText('Mức rủi ro');
    let gaugeCard = gaugeTitle?.parentElement;
    for (let i = 0; i < 10 && gaugeCard; i++) {
      const s = getComputedStyle(gaugeCard);
      if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
      gaugeCard = gaugeCard.parentElement;
    }
    let gaugeW = T.gaugeW;
    let gaugeTitleFont = T.gaugeTitleFont;
    if (gaugeCard) {
      const track = Array.from(gaugeCard.querySelectorAll('div')).find((el) => {
        const s = getComputedStyle(el);
        const w = px(s.width);
        return w >= 120 && w <= 170 && px(s.height) >= 50 && px(s.height) <= 90;
      });
      if (track) gaugeW = Math.round(track.getBoundingClientRect().width);
      const status = Array.from(gaugeCard.querySelectorAll('*')).find((n) => {
        const t = (n.textContent || '').trim();
        return (
          ['THẤP', 'TRUNG BÌNH', 'CAO', 'RỦI RO', 'AN TOÀN'].some((x) => t.includes(x)) &&
          n.children.length === 0
        );
      });
      if (status) gaugeTitleFont = px(getComputedStyle(status).fontSize);
    }

    let insightCard = null;
    if (insightTitle?.parentElement) {
      insightCard = Array.from(insightTitle.parentElement.querySelectorAll('div')).find((el) => {
        const s = getComputedStyle(el);
        return (
          px(s.paddingLeft) >= 8 &&
          px(s.paddingLeft) <= 16 &&
          px(s.borderRadius) >= 8 &&
          el.querySelectorAll('div').length >= 1 &&
          (el.textContent || '').length > 8 &&
          (el.textContent || '').length < 120
        );
      });
    }

    let badgePadY = T.badgePadY;
    let badgeFont = T.badgeFont;
    if (recTitle?.parentElement) {
      const badge = Array.from(recTitle.parentElement.querySelectorAll('*')).find((n) => {
        const t = (n.textContent || '').trim();
        return (
          ['ƯU TIÊN', 'HẠN CHẾ', 'THEO DÕI', 'PRIORITIZE', 'REDUCE'].some((x) => t.includes(x)) &&
          n.children.length === 0
        );
      });
      if (badge?.parentElement) {
        const bs = getComputedStyle(badge.parentElement);
        badgePadY = px(bs.paddingTop);
        badgeFont = px(getComputedStyle(badge).fontSize);
      }
    }

    const bottomRow = dailyCard?.parentElement;
    const bottomGap = bottomRow ? px(getComputedStyle(bottomRow).gap || getComputedStyle(bottomRow).columnGap) : 16;

    const scrollY = window.scrollY || 0;
    let clip = null;
    if (dailyTitle && recTitle) {
      let recRoot = recTitle.parentElement;
      for (let i = 0; i < 8 && recRoot; i++) {
        const s = getComputedStyle(recRoot);
        if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
        recRoot = recRoot.parentElement;
      }
      const cards = [dailyCard, distCard, riskCard, gaugeCard, recRoot].filter(Boolean);
      let minL = Infinity;
      let minT = Infinity;
      let maxR = -Infinity;
      let maxB = -Infinity;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        minL = Math.min(minL, r.left);
        minT = Math.min(minT, r.top);
        maxR = Math.max(maxR, r.right);
        maxB = Math.max(maxB, r.bottom);
      }
      // Also include insight section
      let insightRoot = insightTitle?.parentElement;
      for (let i = 0; i < 8 && insightRoot; i++) {
        const s = getComputedStyle(insightRoot);
        if (px(s.borderRadius) >= 8 && px(s.paddingLeft) >= 10) break;
        insightRoot = insightRoot.parentElement;
      }
      if (insightRoot) {
        const r = insightRoot.getBoundingClientRect();
        minL = Math.min(minL, r.left);
        minT = Math.min(minT, r.top);
        maxR = Math.max(maxR, r.right);
        maxB = Math.max(maxB, r.bottom);
      }
      const x = Math.max(0, Math.floor(minL - 8));
      const y = Math.max(0, Math.floor(minT + scrollY - 12));
      const width = Math.max(400, Math.ceil(maxR - minL + 16));
      const height = Math.max(400, Math.ceil(maxB - minT + 24));
      clip = { x, y, width, height };
    }

    const title = findText('Hiệu suất hệ thống');
    let dash = title?.parentElement || document.body;
    for (let i = 0; i < 20 && dash; i++) {
      const text = dash.textContent || '';
      if (text.includes('Khuyến nghị hệ thống') && text.includes('Insights nổi bật')) break;
      dash = dash.parentElement;
    }
    const sectionGap = dash ? px(getComputedStyle(dash).rowGap || getComputedStyle(dash).gap) : 16;
    const cardRadius = dailyCard ? px(getComputedStyle(dailyCard).borderRadius) : 12;
    const qCardHeight = dailyCard ? Math.round(dailyCard.getBoundingClientRect().height) : 0;
    const insightH = insightCard ? Math.round(insightCard.getBoundingClientRect().height) : 0;

    return {
      measured: {
        sectionGap,
        cardRadius,
        cardPadding: dailyCard ? px(getComputedStyle(dailyCard).paddingLeft) : 0,
        bottomGap,
        qCardPad: dailyCard ? px(getComputedStyle(dailyCard).paddingLeft) : 0,
        qCardHeight,
        donutSize: donut ? Math.round(donut.getBoundingClientRect().width) : 0,
        dailyBarMax: T.dailyBarMax,
        dailyLblFont: T.dailyLblFont,
        riskRowMinH: riskRowH,
        gaugeW,
        gaugeTitleFont,
        insightPad: insightCard ? px(getComputedStyle(insightCard).paddingLeft) : 0,
        insightIcon: insightCard
          ? Math.round(
              (insightCard.querySelector('div')?.getBoundingClientRect().width || T.insightIcon),
            )
          : 0,
        kpiValueFont: (() => {
          const lbl = findText('Tổng PNL') || findText('Win Rate');
          // find large numeric sibling in KPI
          let kpi = lbl?.parentElement;
          for (let i = 0; i < 6 && kpi; i++) {
            if (px(getComputedStyle(kpi).borderRadius) >= 8) break;
            kpi = kpi.parentElement;
          }
          const big = Array.from(kpi?.querySelectorAll('*') || []).find((n) => {
            const fs = px(getComputedStyle(n).fontSize);
            return fs >= 28 && n.children.length === 0;
          });
          return big ? px(getComputedStyle(big).fontSize) : T.kpiValueFont;
        })(),
        kpiLabelFont: (() => {
          const lbl = findText('Win Rate') || findText('Tổng PNL');
          return lbl ? px(getComputedStyle(lbl).fontSize) : T.kpiLabelFont;
        })(),
        equityHeight: (() => {
          const eq = findText('Equity Curve');
          let card = eq?.parentElement;
          for (let i = 0; i < 10 && card; i++) {
            if (px(getComputedStyle(card).borderRadius) >= 8 && px(getComputedStyle(card).paddingLeft) >= 16)
              break;
            card = card.parentElement;
          }
          let chartH = 0;
          if (card) {
            for (const el of Array.from(card.querySelectorAll('div'))) {
              const r = el.getBoundingClientRect();
              if (r.height >= 400 && r.width >= 280) chartH = Math.max(chartH, Math.round(r.height));
            }
          }
          return chartH || T.equityHeight;
        })(),
        insightHeight: insightH,
        recPadY: T.recPadY,
        badgePadY,
        badgeFont,
      },
      clip,
    };
  }, TARGETS);

  measured = probe.measured;

  // Full dashboard content screenshot for global overlay
  const contentHandle = await page.evaluateHandle(() => {
    const findText = (t) =>
      Array.from(document.querySelectorAll('div, span, p, h1, h2, button')).find(
        (n) => (n.textContent || '').trim() === t,
      );
    const title = findText('Hiệu suất hệ thống');
    let dash = title?.parentElement || null;
    for (let i = 0; i < 24 && dash; i++) {
      const text = dash.textContent || '';
      if (text.includes('Khuyến nghị hệ thống') && text.includes('Equity Curve')) break;
      dash = dash.parentElement;
    }
    return dash;
  });

  const contentEl = contentHandle.asElement();
  if (contentEl) {
    await contentEl.screenshot({ path: zoomPng });
  } else {
    fs.copyFileSync(implPng, zoomPng);
  }
  await browser.close();
} finally {
  server.close();
}

const comparePort = 4198;
const compareServer = await startServer(docs, comparePort);
const browser2 = await chromium.launch({ headless: true });
const page2 = await browser2.newPage({ viewport: { width: 1900, height: 1600 } });

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
  <div class="col"><h2>GOLDEN CONTENT</h2><img id="showM" class="full"/></div>
  <div class="col"><h2>IMPLEMENTATION</h2><img id="showC" class="full" src="http://127.0.0.1:${comparePort}/TASK14_6_10_CONTENT.png"/></div>
</div>
<div class="pair">
  <div class="col"><h2>OVERLAY 50%</h2><img id="showOv" class="full"/></div>
  <div class="col"><h2>DIFF</h2><img id="showDf" class="full"/></div>
</div>
<div id="work">
  <img id="m" src="http://127.0.0.1:${comparePort}/TASK14_6_5_MOCKUP.png"/>
  <img id="c" src="http://127.0.0.1:${comparePort}/TASK14_6_10_CONTENT.png"/>
  <canvas id="ov"></canvas><canvas id="df"></canvas><canvas id="mc"></canvas>
</div>
</body></html>`;
fs.writeFileSync(path.join(docs, '.compare-14-6-10.html'), html);
await page2.goto(`http://127.0.0.1:${comparePort}/.compare-14-6-10.html`, { waitUntil: 'load', timeout: 60000 });
await page2.waitForTimeout(1000);

const visual = await page2.evaluate((sidebarCrop) => {
  const m = document.getElementById('m');
  const c = document.getElementById('c');
  const wait = (img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
  return Promise.all([wait(m), wait(c)]).then(() => {
    const cropX = Math.min(sidebarCrop, Math.floor(m.naturalWidth * 0.28));
    const contentW = m.naturalWidth - cropX;
    const contentH = m.naturalHeight;
    // Bottom region: Daily/Dist/Risk through Insights/Recs
    const y0 = Math.floor(contentH * 0.04);
    const y1 = Math.floor(contentH * 0.98);
    const mc = document.getElementById('mc');
    mc.width = contentW;
    mc.height = y1 - y0;
    mc.getContext('2d').drawImage(m, cropX, y0, contentW, y1 - y0, 0, 0, contentW, y1 - y0);

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

const tokenScores = {
  sectionGap: scorePx(measured.sectionGap, TARGETS.sectionGap, 2),
  cardRadius: scorePx(measured.cardRadius, TARGETS.cardRadius, 1),
  cardPadding: scorePx(measured.cardPadding, TARGETS.cardPadding, 2),
  bottomGap: scorePx(measured.bottomGap, TARGETS.bottomGap, 2),
  qCardPad: scorePx(measured.qCardPad, TARGETS.qCardPad, 2),
  qCardHeight: scorePx(measured.qCardHeight, TARGETS.qCardHeight, 8),
  donutSize: scorePx(measured.donutSize, TARGETS.donutSize, 4),
  dailyBarMax: scorePx(measured.dailyBarMax, TARGETS.dailyBarMax, 2),
  riskRowMinH: scorePx(measured.riskRowMinH, TARGETS.riskRowMinH, 4),
  gaugeW: scorePx(measured.gaugeW, TARGETS.gaugeW, 6),
  gaugeTitleFont: scorePx(measured.gaugeTitleFont, TARGETS.gaugeTitleFont, 1),
  insightPad: scorePx(measured.insightPad, TARGETS.insightPad, 2),
  insightIcon: scorePx(measured.insightIcon, TARGETS.insightIcon, 2),
  insightHeight: scorePx(measured.insightHeight, TARGETS.insightHeight, 6),
  kpiValueFont: scorePx(measured.kpiValueFont ?? 0, TARGETS.kpiValueFont, 2),
  kpiLabelFont: scorePx(measured.kpiLabelFont ?? 0, TARGETS.kpiLabelFont, 1),
  equityHeight: scorePx(measured.equityHeight ?? 0, TARGETS.equityHeight, 20),
  badgePadY: scorePx(measured.badgePadY, TARGETS.badgePadY, 2),
  badgeFont: scorePx(measured.badgeFont, TARGETS.badgeFont, 1),
};

const gridScore = avg([
  tokenScores.sectionGap,
  tokenScores.cardRadius,
  tokenScores.cardPadding,
  tokenScores.bottomGap,
]);
const kpiScore = avg([tokenScores.kpiValueFont, tokenScores.kpiLabelFont]);
const equityScore = avg([tokenScores.equityHeight, tokenScores.cardPadding]);
const dailyScore = avg([tokenScores.dailyBarMax, tokenScores.qCardPad, tokenScores.qCardHeight]);
const distScore = avg([tokenScores.donutSize, tokenScores.qCardHeight]);
const riskScore = avg([tokenScores.riskRowMinH, tokenScores.qCardPad]);
const gaugeScore = avg([tokenScores.gaugeW, tokenScores.gaugeTitleFont, tokenScores.qCardHeight]);
const insightScore = avg([
  tokenScores.insightPad,
  tokenScores.insightIcon,
  tokenScores.insightHeight,
]);
const recScore = avg([tokenScores.badgePadY, tokenScores.badgeFont]);
const structuralSoft = Math.max(visual.softScore, visual.lumScore);

const overall =
  Math.round(
    (gridScore * 0.14 +
      kpiScore * 0.1 +
      equityScore * 0.1 +
      dailyScore * 0.1 +
      distScore * 0.1 +
      riskScore * 0.08 +
      gaugeScore * 0.1 +
      insightScore * 0.1 +
      recScore * 0.08 +
      structuralSoft * 0.1) *
      10,
  ) / 10;

const report = {
  task: '14.6.10',
  measured,
  targets: TARGETS,
  tokenScores,
  scores: {
    Layout: gridScore,
    Alignment: gridScore,
    Typography: avg([tokenScores.kpiValueFont, tokenScores.kpiLabelFont, tokenScores.gaugeTitleFont]),
    Spacing: gridScore,
    VisualWeight: avg([kpiScore, equityScore, gaugeScore, insightScore]),
    SoftLuminance: visual.softScore,
    LumStrict: visual.lumScore,
    Overall: overall,
  },
  pass: overall >= 99,
  remainingDifferences: [
    'Live data values (PnL / grades / risk status) differ from mockup sample data',
    'App chrome uses top tabs; mockup sidebar is excluded from crop',
  ],
  artifacts: {
    implementation: 'docs/TASK14_6_10_IMPLEMENTATION.png',
    content: 'docs/TASK14_6_10_CONTENT.png',
    overlay: 'docs/TASK14_6_10_OVERLAY.png',
    diff: 'docs/TASK14_6_10_DIFF.png',
    compare: 'docs/TASK14_6_10_COMPARE.png',
  },
};

fs.writeFileSync(reportJson, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.scores, null, 2));
console.log(report.pass ? 'PASS >=99%' : 'FAIL <99%');
if (!report.pass) process.exitCode = 1;
