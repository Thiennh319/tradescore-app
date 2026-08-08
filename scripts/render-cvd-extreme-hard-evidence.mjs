import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const outDir = path.join(process.cwd(), 'docs', 'exports', 'rule-trace-l5a-block-type');
const ev = fs.readFileSync(path.join(outDir, 'CVD_EXTREME_HARD_EVIDENCE.txt'), 'utf8');
const escaped = ev
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0B0E11;color:#EAECEF;font:13px/1.45 Consolas,monospace;padding:24px}
h1{font:700 14px sans-serif;color:#F0B90B;margin:0 0 12px}
pre{white-space:pre-wrap;background:#1E2329;border:1px solid #363A45;border-radius:8px;padding:16px;margin:0}
.tag{display:inline-block;margin-top:12px;padding:6px 12px;border-radius:6px;background:rgba(246,70,93,.18);color:#F6465D;font:700 12px sans-serif}
</style></head><body>
<h1>(c) CVD extreme Short — Rule Trace L5a evidence (engine + wire)</h1>
<pre>${escaped}</pre>
<div class="tag">Confirmed: Block Type HARD</div>
</body></html>`;

const htmlPath = path.join(outDir, 'cvd-extreme-hard-preview.html');
fs.writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 920, height: 700 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(htmlPath).href);
const pngPath = path.join(outDir, 'CVD_EXTREME_HARD_L5A_BLOCKTYPE.png');
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();
console.log('PNG:', pngPath);
