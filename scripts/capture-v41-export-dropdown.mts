/**
 * Capture V4.1 Export kind dropdown PNG from live V41_PANEL_EXPORT_OPTIONS.
 * Renders the same Trace menu structure/styles as V41SignalPanel.
 *
 * Usage: npx tsx scripts/capture-v41-export-dropdown.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { V41_PANEL_EXPORT_OPTIONS } from '../services/v41Export/wire/runV41MiExport';

const OUT_DIR = join(process.cwd(), 'docs', 'screenshots');
const HTML_PATH = join(OUT_DIR, 'v41-export-dropdown.html');
const PNG_PATH = join(OUT_DIR, 'v41-export-dropdown-rulebook-enabled.png');

const optionsHtml = V41_PANEL_EXPORT_OPTIONS.map((opt, index) => {
  const active = opt.id === 'marketIntelligence';
  const disabled = !opt.enabled;
  const classes = [
    'opt',
    active ? 'active' : '',
    disabled ? 'disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const textClass = [
    'opt-text',
    active ? 'active-text' : '',
    disabled ? 'muted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const check = active ? '<span class="check">✓</span>' : '';
  return `<button type="button" class="${classes}" data-id="${opt.id}" data-enabled="${opt.enabled}" ${disabled ? 'disabled' : ''} data-index="${index}">
  <span class="${textClass}">${opt.label}</span>
  ${check}
</button>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>V4.1 Export Trace dropdown</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #0B0E11;
      font-family: Inter, Segoe UI, system-ui, sans-serif;
      color: #EAECEF;
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      padding: 48px 64px;
    }
    .frame {
      position: relative;
      width: 420px;
    }
    .header-bar {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1E2329;
      border: 1px solid #363A45;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #848E9C;
    }
    .pill.open { border-color: #F0B90B; color: #F0B90B; }
    .export {
      background: #F0B90B;
      color: #0B0E11;
      border: none;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 800;
    }
    .menu {
      width: 260px;
      margin-left: auto;
      background: #1E2329;
      border: 1px solid #363A45;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    }
    .menu-header {
      padding: 10px 12px 4px;
      background: #0B0E11;
      border-bottom: 1px solid #363A45;
      font-size: 11px;
      font-weight: 700;
      color: #5E6673;
      letter-spacing: 0.3px;
    }
    .opt {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      background: transparent;
      border: none;
      border-bottom: 1px solid #363A45;
      cursor: pointer;
      text-align: left;
    }
    .opt.active { background: rgba(240, 185, 11, 0.06); }
    .opt.disabled { opacity: 0.45; cursor: not-allowed; }
    .opt-text {
      font-size: 12px;
      font-weight: 600;
      color: #848E9C;
    }
    .opt-text.active-text { color: #F0B90B; font-weight: 800; }
    .opt-text.muted { color: #5E6673; }
    .right { display: inline-flex; align-items: center; gap: 8px; }
    .check { color: #F0B90B; font-weight: 700; font-size: 12px; }
    .caption {
      margin-top: 16px;
      font-size: 11px;
      color: #5E6673;
      text-align: right;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="frame" id="capture-root">
    <div class="header-bar">
      <div class="pill">BTCUSDT ▾</div>
      <div class="pill open">Market Intelligence ▾</div>
      <button class="export" type="button">📄 Export</button>
    </div>
    <div class="menu" id="kind-menu" aria-label="Trace V4.1">
      <div class="menu-header">Trace (V4.1)</div>
      ${optionsHtml}
    </div>
    <p class="caption">Source: V41_PANEL_EXPORT_OPTIONS<br/>Rulebook enabled=${String(
      V41_PANEL_EXPORT_OPTIONS.find((o) => o.id === 'rulebook')?.enabled === true,
    )}</p>
  </div>
</body>
</html>`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(HTML_PATH, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 720, height: 560 },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(HTML_PATH).href);
await page.locator('#capture-root').screenshot({ path: PNG_PATH });
await browser.close();

const rulebook = V41_PANEL_EXPORT_OPTIONS.find((o) => o.id === 'rulebook');
console.log('HTML:', HTML_PATH);
console.log('PNG:', PNG_PATH);
console.log('rulebook.enabled =', rulebook?.enabled);
console.log(
  'enabled ids =',
  V41_PANEL_EXPORT_OPTIONS.filter((o) => o.enabled).map((o) => o.id).join(', '),
);
