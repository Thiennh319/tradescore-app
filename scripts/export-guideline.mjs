import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const src = path.join(root, 'dist', 'guideline.txt');
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');

if (!fs.existsSync(src)) {
  console.error('Missing dist/guideline.txt');
  process.exit(1);
}

const content = fs.readFileSync(src, 'utf8');
const header = `================================================================================
GUIDELINE EXPORT — TradeScore v${version}
Generated: ${date}
Source: dist/guideline.txt
Tests: 567 vitest | Runtime: V3+V4 only (V4.1 excluded)
================================================================================

`;

const exportPath = path.join(root, 'dist', 'GUIDELINE-export.txt');
fs.writeFileSync(exportPath, header + content, 'utf8');

const targets = [
  path.join(root, 'dist', `TradeScore-Web-v${version}`, 'guideline.txt'),
  exportPath,
];

for (const dest of targets) {
  if (dest === exportPath) continue;
  const dir = path.dirname(dest);
  if (fs.existsSync(dir)) {
    fs.copyFileSync(src, dest);
    console.log('Copied:', dest);
  }
}

console.log('Export:', exportPath, `(${fs.statSync(exportPath).size} bytes)`);
